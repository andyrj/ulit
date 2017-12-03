const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const templateCache = new Map();
const walkPath = [];

function walkDOM(parent, element, fn) {
  element && fn(parent, element);
  element || (element = parent);
  if (element.childNodes.length > 0) {
    [].forEach.call(element.childNodes, (child, index) => {
      walkPath.push(index);
      walkDOM(element, child, fn);
      walkPath.pop();
    });
  }
}

function followPath(node, pointer) {
  if (pointer.length === 0) {
    return node;
  }
  const cPath = pointer.slice(0);
  const curr = cPath.shift();
  const num = parseInt(curr);
  if (typeof curr === "string") {
    return [node, curr];
  } else if (!isNaN(num)) {
    return followPath(node.childNodes[num], cPath);
  } else {
    throw new RangeError("part path not found");
  }
}

function templateSetup(parts) {
  return function(parent, element) {
    const nodeType = element.nodeType;
    if (nodeType === TEXT_NODE) {
      const text = element.nodeValue;
      const split = text.split("{{}}");
      const end = split.length - 1;
      const nodes = [];
      let cursor = 0;
      if (split.length > 0) {
        split.forEach((node, i) => {
          if (node !== "") {
            nodes.push(document.createTextNode(node));
            cursor++;
          }
          if (i < end) {
            nodes.push(document.createComment("{{}}"));
            const adjustedPath = walkPath.slice(0);
            const len = adjustedPath.length - 1;
            adjustedPath[len] += cursor;
            parts.push({
              id: Symbol(),
              path: adjustedPath,
              start: null,
              end: null,
              dispose: null
            });
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element);
        });
        parent.removeChild(element);
      }
    } else if (nodeType === ELEMENT_NODE) {
      [].forEach.call(element.attributes, attr => {
        if (attr.nodeValue === "{{}}") {
          parts.push({
            id: Symbol(),
            path: walkPath.concat(attr.nodeName),
            start: null,
            end: null,
            dispose: null
          });
        }
      });
    }
  };
}

function updateAttribute(element, name, value) {
  try {
    element[name] = value == null ? "" : value;
  } catch (_) {} // eslint-disable-line
  if (typeof expr !== "function") {
    if (value == null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }
}

function updateTextNode(part, value) {
  const element = part.start;
  const parent = element.parentNode;
  if (element.nodeType === TEXT_NODE && element.nodeValue !== value) {
    element.nodeValue = value;
  } else if (element.nodeType === COMMENT_NODE && typeof value === "string") {
    const newNode = document.createTextNode(value);
    parent.replaceChild(newNode, element);
    part.start = part.end = newNode;
  }
}

function updateNode(part, value) {
  const element = part.start;
  const parent = element.parentNode;
  parent.replaceChild(value, element);
  part.start = part.end = value;
}

function flushPart(part) {
  if (part.start !== part.end || part.end != null) {
    const parent = part.start.parentNode;
    let lastNode = part.end;
    while (lastNode) {
      const nextNode = lastNode.previousSibling;
      parent.removeChild(lastNode);
      if (nextNode !== part.start) {
        lastNode = nextNode;
      } else {
        lastNode = null;
      }
    }
  }
  return part.start;
}

function updateArray(part, value) {
  // TODO: add logic for rendering arrays...
}

export function render(template, target = document.body, part = null) {
  let instance;
  if (target.__template) {
    instance = target.__template;
  } else if (
    target.childNodes &&
    target.childNodes.length > 0 &&
    target.childNodes[0].__template
  ) {
    instance = target.childNodes[0].__template;
  }
  if (instance) {
    instance.update(template.values);
    return;
  }
  if (part == null) {
    template.update();
    if (target.childNodes.length > 0) {
      while (target.hasChildNodes) {
        target.removeChild(target.lastChild);
      }
    }
    target.appendChild(template.fragment.content);
    target.childNodes[0].__template = template;
  } else if (target.nodeType === COMMENT_NODE) {
    template.update();
    part.start = template.fragment.content.firstChild;
    part.end = template.fragment.content.lastChild;
    target.parentNode.replaceChild(template.fragment.content, target);
    part.start.__template = template;
  }
}

function set(part, value) {
  const target = part.start;
  if (Array.isArray(target)) {
    const element = target[0];
    const name = target[1];
    updateAttribute(element, name, value);
  } else {
    if (typeof value === "string") {
      updateTextNode(part, value);
    } else if (value.nodeType === ELEMENT_NODE && target !== value) {
      updateNode(part, value);
    } else if (value.values && value.update) {
      render(value, target, part);
    } else if (Array.isArray(value)) {
      updateArray(part, value);
    } else if (value.then) {
      value.then(promised => {
        set(part, promised);
      });
    }
  }
}

function isDirective(target, expression) {
  return (
    typeof expression === "function" &&
    ((Array.isArray(target) && !target[1].startsWith("on")) ||
      !Array.isArray(target))
  );
}

function TemplateResult(template, parts, exprs) {
  let disposed = false;
  const result = {
    template,
    fragment: null,
    values: exprs,
    dispose() {
      disposed = true;
      parts.forEach(part => typeof part.dispose === "function" ? part.dispose() : null);
    },
    update(values) {
      if (values != null) {
        result.values = values;
      }
      if (!result.fragment) {
        result.fragment = document.importNode(template, true);
        parts.forEach(part => {
          part.start = followPath(result.fragment.content, part.path);
        });
      }
      parts.forEach((part, i) => {
        const target = part.start;
        const expression = result.values[i];
        if (isDirective(target, expression)) {
          expression(newValue => {
            set(part, newValue);
          },
          dispose => {
            part.dispose = dispose;
          },
          part.id);
        } else {
          set(part, expression);
        }
      });
    } 
  };
  return result;
}

export function html(strs, ...exprs) {
  const markup = strs.join("{{}}");
  let { template, parts } = templateCache.get(strs) || { template: null, parts: [] };
  if (template == null) {
    template = document.createElement("template");
    template.innerHTML = markup;
    walkDOM(template.content, null, templateSetup(parts));
    templateCache.set(strs, { template, parts });
  }
  return TemplateResult(template, parts, exprs);
}

export function until(promise, defaultContent) {
  return ({ update }) => {
    update(defaultContent);
    return promise;
  };
}

function defaultKeyFn(item) {
  return item.key;
}

function defaultTemplateFn(item, key) {
  return html`${item.value}`;
}

const keyMapCache = new Map();
export function repeat(items, keyFn = defaultKeyFn, templateFn = defaultTemplateFn) {
  return ({ update, id, addDisposer }) => {
    const keyMapPair = keyMapCache.get(id);
    if (!keyMapPair) {
      let templates;
      let newKeyMap;
      items.forEach(item => {
        const key = keyFn(item);
        const template = templateFn(item, key);
        templates.push(template);
        newKeyMap.push({ key, template });
      });
      keyMapCache.set(id, newKeyMap);
      update(templates);
    } else {
      const newMap = items.map(item => keyFn(item));
      // TODO: do key comparisons here to efficiently add/move/remove dom nodes
    }
  }
}
