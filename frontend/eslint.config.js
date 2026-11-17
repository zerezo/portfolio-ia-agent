import globals from 'globals';

// Red de seguridad mínima: nombres sin definir (un error así compila pero rompe la web al
// cargarla). Se ejecuta en CI antes del build.
export default [
  { ignores: ['dist/'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
];
