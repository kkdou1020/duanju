/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                banana: {
                    50: '#fffaeb',
                    100: '#fef3c7',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    900: '#78350f',
                },
                dark: {
                    800: '#1e1e24',
                    900: '#121216',
                }
            }
        }
    },
    plugins: [],
}
