// main.cjs
const { app, BrowserWindow, net, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const netModule = require('net');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;
let serverPort = 3002;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

const isPackaged = app.isPackaged;
const appPath = isPackaged ? path.dirname(process.execPath) : __dirname;

// 1. 动态检测并寻找可用端口，避免端口冲突
function findAvailablePort(startPort, callback) {
  const server = netModule.createServer();
  server.unref();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      findAvailablePort(startPort + 1, callback); // 端口被占用，尝试下一个
    } else {
      callback(err);
    }
  });
  server.listen(startPort, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => {
      callback(null, port);
    });
  });
}

// 2. 日志持久化：将后端输出流重定向写入到安装路径的 logs 文件夹下
function getLogStream() {
  const logDir = path.join(appPath, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, 'backend-service.log');
  return fs.createWriteStream(logFile, { flags: 'a' });
}

function startExpressServer(port) {
  const serverPath = path.join(app.getAppPath(), 'server/dist/index.js');
  const logStream = getLogStream();

  console.log(`[Electron Main] Launching backend on port ${port}...`);

  // 使用 stdio: ['inherit', 'pipe', 'pipe', 'ipc'] 捕获输入输出
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port.toString(),
      EXTERNAL_ENV_PATH: appPath
    },
    stdio: ['inherit', 'pipe', 'pipe', 'ipc']
  });

  // 管道重定向
  serverProcess.stdout.on('data', (data) => {
    const line = `[${new Date().toISOString()}] [INFO] ${data.toString()}`;
    logStream.write(line);
    process.stdout.write(data);
  });

  serverProcess.stderr.on('data', (data) => {
    const line = `[${new Date().toISOString()}] [ERROR] ${data.toString()}`;
    logStream.write(line);
    process.stderr.write(data);
  });

  serverProcess.on('error', (err) => {
    logStream.write(`[${new Date().toISOString()}] [CRITICAL] Failed to fork backend: ${err.message}\n`);
    console.error('[Electron Main] Fork backend error:', err);
  });

  // 3. 后端崩溃自动恢复机制
  serverProcess.on('exit', (code, signal) => {
    const crashMsg = `[${new Date().toISOString()}] Backend exited with code ${code}, signal ${signal}\n`;
    logStream.write(crashMsg);
    console.log(crashMsg);

    // 只有在主程序没有退出的情况下，且未超出最大重启次数时才尝试重启
    if (!app.isQuitting && restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      console.warn(`[Electron Main] Backend crashed. Restarting (${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
      setTimeout(() => startExpressServer(port), 1000);
    } else if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
      dialog.showErrorBox(
        "后台服务崩溃",
        "后台服务在多次尝试启动后均告失败。请检查端口是否被占用，或将日志反馈给开发人员。日志路径：\n" + 
        path.join(appPath, 'logs')
      );
    }
  });
}

function checkServerReady(port, callback) {
  const check = () => {
    const request = net.request(`http://127.0.0.1:${port}/api/config`);
    request.on('response', (response) => {
      if (response.statusCode === 200) {
        callback(null);
      } else {
        setTimeout(check, 150);
      }
    });
    request.on('error', () => {
      setTimeout(check, 150);
    });
    request.end();
  };
  check();
}

// 设置并初始化自动更新逻辑
function setupAutoUpdater() {
  autoUpdater.autoDownload = true; 

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] 发现新版本: ${info.version}，开始后台下载...`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] 新版本 ${info.version} 下载完成。`);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新提示',
      message: `新版本 ${info.version} 已下载就绪！`,
      detail: '点击“立即重启”，系统将自动关闭并安装更新包。',
      buttons: ['立即重启', '稍后安装'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] 自动更新出错:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "NanoBanana Storyboarder",
    icon: path.join(__dirname, 'public/icon.png')
  });

  checkServerReady(serverPort, () => {
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 查找可用端口后启动
  findAvailablePort(3002, (err, freePort) => {
    if (err) {
      dialog.showErrorBox("端口获取失败", "无法在系统上寻找可用空闲端口。");
      app.quit();
      return;
    }
    serverPort = freePort;
    startExpressServer(serverPort);
    createWindow();
    
    // 初始化自动更新
    setupAutoUpdater();
    // 延迟 5 秒等界面加载完后检测更新
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 5000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
