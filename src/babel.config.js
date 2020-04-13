module.exports = {
  presets: [['@babel/preset-env', { modules: false }], 'jest'],
  plugins: ['@babel/plugin-syntax-dynamic-import'],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: { node: 'current' },
          },
          'jest',
        ],
      ],
      plugins: ['@babel/plugin-transform-runtime'],
    },
  },
};
