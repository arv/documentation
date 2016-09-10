'use strict';

var fs = require('fs'),
  path = require('path'),
  File = require('vinyl'),
  vfs = require('vinyl-fs'),
  _ = require('lodash'),
  concat = require('concat-stream'),
  GithubSlugger = require('github-slugger'),
  createFormatters = require('../').util.createFormatters,
  createLinkerStack = require('../').util.createLinkerStack,
  hljs = require('highlight.js');

module.exports = function (comments, options, callback) {

  var linkerStack = createLinkerStack(options)
    .namespaceResolver(comments, function (namespace) {
      var slugger = new GithubSlugger();
      return '#' + slugger.slug(namespace);
    });

  var formatters = createFormatters(linkerStack.link);

  hljs.configure(options.hljs || {});

  var sharedImports = {
    imports: {
      slug: function (str) {
        var slugger = new GithubSlugger();
        return slugger.slug(str);
      },
      shortSignature: function (section) {
        var prefix = '';
        if (section.kind === 'class') {
          return section +
            (section.augments ? ` extends ${section.augments}` : '') + ' {}';
        } else if (section.kind === 'typedef') {
          return `type ${section.name}`;
        } else if (section.kind !== 'function') {
          return section.name;
        }
        return prefix + section.name + formatters.parameters(section, true);
      },
      signature: function (section) {
        var returns = '';
        if (section.kind === 'class') {
          return `class ${section.name}` +
            (section.augments ? ` extends ${
              section.augments.map(a => formatters.autolink(a.name))
            }` : '') + ' {}';
        }
        if (section.kind === 'typedef') {
          return `type ${section.name} = ${formatters.type(section.type)}`;
        }
        if (section.kind === 'member') {
          // if (section.name === 'isMeta') {
          //   console.log(JSON.stringify(section, null, 2));
          // }

          if (section.returns) {  // getter
            return `get ${section.name}(): ${formatters.type(section.returns[0].type)}`;
          }

          return `${section.name}: = ${formatters.type(section.type)}`;
        }
        // if (section.kind === 'get') {
        //   return `get ${section.name}(): ${formatters.type(section.returnType)}`;
        // }


        if (section.kind === 'constant') {
          var type = section.type ? `: ${formatters.type(section.type)}` : '';
          return `const ${section.name}${type}`;
        }
        if (section.kind !== 'function') {
          return section.name;
        }
        if (section.returns) {
          returns = ': ' +
            formatters.type(section.returns[0].type);
        }
        var prefix = '';
        if (!section.memberof) {
          prefix = 'function ';
        }
        return prefix + section.name + formatters.parameters(section) + returns;
      },
      md: function (ast, inline) {
        if (inline && ast && ast.children.length && ast.children[0].type === 'paragraph') {
          ast = {
            type: 'root',
            children: ast.children[0].children.concat(ast.children.slice(1))
          };
        }
        return formatters.markdown(ast);
      },
      formatType: formatters.type,
      autolink: formatters.autolink,
      highlight: function (example) {
        if (options.hljs && options.hljs.highlightAuto) {
          return hljs.highlightAuto(example).value;
        }
        return hljs.highlight('js', example).value;
      },
      fixKind(kind) {
        switch (kind) {
        case 'typedef':
          return 'type';
        }
        return kind;
      }
    }
  };

  sharedImports.imports.renderSectionList =  _.template(fs.readFileSync(path.join(__dirname, 'section_list._'), 'utf8'), sharedImports);
  sharedImports.imports.renderSection = _.template(fs.readFileSync(path.join(__dirname, 'section._'), 'utf8'), sharedImports);
  sharedImports.imports.renderNote = _.template(fs.readFileSync(path.join(__dirname, 'note._'), 'utf8'), sharedImports);

  var pageTemplate = _.template(fs.readFileSync(path.join(__dirname, 'index._'), 'utf8'),  sharedImports);

  // push assets into the pipeline as well.
  vfs.src([__dirname + '/assets/**'], { base: __dirname })
    .pipe(concat(function (files) {
      callback(null, files.concat(new File({
        path: 'index.html',
        contents: new Buffer(pageTemplate({
          docs: comments,
          options: options
        }), 'utf8')
      })));
    }));
};
