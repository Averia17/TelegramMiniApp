module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'warn',
    "react/prop-types": 0,
    "indent": ["error", 2],
    // Line endings are normalized by Git and vary between developer platforms.
    "linebreak-style": "off",
    "quotes": ["error", "double"],
    "semi": ["error", "never"],
  },
}
