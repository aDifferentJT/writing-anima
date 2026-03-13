/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        // Obsidian-inspired color palette
        obsidian: {
          // Dark mode colors
          darker: '#0d0d0d',
          dark: '#1e1e1e',
          medium: '#2d2d2d',
          light: '#3d3d3d',
          lighter: '#4d4d4d',
          // Light mode colors
          bg: '#fafafa',
          surface: '#ffffff',
          border: '#e5e5e5',
          'border-focus': '#d4d4d4',
          // Text colors
          text: {
            primary: '#1a1a1a',
            secondary: '#525252',
            tertiary: '#737373',
            muted: '#a3a3a3',
          },
          // Accent colors (purple-based like Obsidian)
          accent: {
            primary: '#7c3aed',
            secondary: '#6d28d9',
            light: '#a78bfa',
            lighter: '#c4b5fd',
            pale: '#ede9fe',
          },
          // Semantic colors
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'obsidian-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'obsidian': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'obsidian-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'obsidian-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'obsidian-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'obsidian': '6px',
        'obsidian-lg': '8px',
      }
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
}