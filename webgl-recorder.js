(function() {
  var getContext = HTMLCanvasElement.prototype.getContext;
  var requestAnimationFrame = window.requestAnimationFrame;
  var frameSincePageLoad = 0;

  function countFrames() {
    frameSincePageLoad++;
    requestAnimationFrame(countFrames);
  }

  window.requestAnimationFrame = function() {
    return requestAnimationFrame.apply(window, arguments);
  };

  HTMLCanvasElement.prototype.getContext = function(type) {
    var canvas = this;
    var context = getContext.apply(canvas, arguments);

    if (type === 'webgl' || type === 'experimental-webgl') {
      var oldWidth = canvas.width;
      var oldHeight = canvas.height;
      var oldFrameCount = frameSincePageLoad;
      var trace = [];
      var variables = {};
      var fakeContext = {
        trace: trace,
        compileTrace: compileTrace,
        downloadTrace: downloadTrace,
      };

      trace.push('  gl.canvas.width = ' + oldWidth + ';');
      trace.push('  gl.canvas.height = ' + oldHeight + ';');

      function compileTrace() {
        var text = 'async function* render(gl) {\n';
        text += '  // Recorded using https://github.com/evanw/webgl-recorder\n';
        for (var key in variables) {
          text += '  var ' + key + 's = [];\n';
        }
        text += trace.join('\n');
        text += '\n}\n';
        return text;
      }

      function downloadTrace() {
        var text = compileTrace();
        var link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([text], {type: 'application/javascript'}));
        link.download = 'trace.js';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      function getVariable(value) {
        if (value instanceof WebGLActiveInfo ||
            value instanceof WebGLBuffer ||
            value instanceof WebGLFramebuffer ||
            value instanceof WebGLProgram ||
            value instanceof WebGLRenderbuffer ||
            value instanceof WebGLShader ||
            value instanceof WebGLShaderPrecisionFormat ||
            value instanceof WebGLTexture ||
            value instanceof WebGLUniformLocation) {
          var name = value.constructor.name;
          var list = variables[name] || (variables[name] = []);
          var index = list.indexOf(value);

          if (index === -1) {
            index = list.length;
            list.push(value);
          }

          return name + 's[' + index + ']';
        }

        return null;
      }

      for (var key in context) {
        var value = context[key];

        if (typeof value === 'function') {
          fakeContext[key] = function(key, value) {
            return function() {
              var result = value.apply(context, arguments);
              var args = [];

              if (frameSincePageLoad !== oldFrameCount) {
                oldFrameCount = frameSincePageLoad;
                trace.push('  yield;');
              }

              if (canvas.width !== oldWidth || canvas.height !== oldHeight) {
                oldWidth = canvas.width;
                oldHeight = canvas.height;
                trace.push('  gl.canvas.width = ' + oldWidth + ';');
                trace.push('  gl.canvas.height = ' + oldHeight + ';');
              }

              for (var i = 0; i < arguments.length; i++) {
                var arg = arguments[i];

                if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'string' || arg instanceof Array || arg === null) {
                  args.push(JSON.stringify(arg));
                }

                else if (arg instanceof ArrayBuffer) {
                  args.push('(new Int8Array([' + new Int8Array(arg).join(',') + '])).buffer');
                }

                else if (ArrayBuffer.isView(arg)) {
                  args.push('new ' + arg.constructor.name + '([' + Array.prototype.slice.call(arg) + '])');
                }

                else if (arg instanceof Image) {
                  // var c = document.createElement("canvas");
                  // c.width = arg.width;
                  // c.height = arg.height;
                  // c.getContext("2d").drawImage(arg, 0, 0);
                  // var i = c.toDataURL("image/png");
                  // trace.push('  var image = await new Promise(function(resolve) { let i = new Image(); i.onload = function() { resolve(this); }; i.src = \'' + i + '\'; });');
                  trace.push('  var image = await new Promise(function(resolve) { let i = new Image(); i.onload = function() { resolve(this); }; i.src = \'' + arg.src + '\'; });');
                  args.push('image');
                }

                else if (arg instanceof ImageBitmap) {
                  var c = document.createElement("canvas");
                  c.width = arg.width;
                  c.height = arg.height;
                  c.getContext("2d").drawImage(arg, 0, 0);
                  var i = c.toDataURL("image/png");
                  // trace.push('  var image = new Image(); image.src = \'' + image + '\'; var imageBitmap = await createImageBitmap(image, 0, 0, ' + arg.width + ', ' + arg.height +  ');');
                  trace.push('  var image = await new Promise(function(resolve) { let i = new Image(); i.onload = function() { resolve(this); }; i.src = \'' + i + '\'; });');
                  args.push('image');
                }

                else {
                  var variable = getVariable(arg);
                  if (variable !== null) {
                    args.push(variable);
                  }

                  else {
                    console.warn('unsupported value:', arg);
                    args.push('null');
                  }
                }
              }

              var text = 'gl.' + key + '(' + args.join(', ') + ');';
              var variable = getVariable(result);
              if (variable !== null) text = variable + ' = ' + text;
              trace.push('  ' + text);

              return result;
            };
          }(key, value);
        }

        else {
          fakeContext[key] = value;
        }
      }

      return fakeContext;
    }

    return context;
  };

  countFrames();
})();
