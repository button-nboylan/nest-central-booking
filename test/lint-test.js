const paths = ['**/*.js', '!node_modules/**/*'];

// FIXME :: prob can remove this?

require('mocha-eslint')(paths);
