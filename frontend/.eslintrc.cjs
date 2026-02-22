module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/no-unknown-property': 'off',
    'no-unused-vars': 'off',
    'no-empty': 'off',
    'no-extra-boolean-cast': 'off',
    'no-useless-catch': 'off',
    'no-useless-escape': 'off',
    'no-undef': 'off',
  },
  ignorePatterns: ['dist', 'node_modules'],
}
