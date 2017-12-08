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

function Part(path, id = Symbol(), start = null, end = null) {
  const disposers = [];
  let part = { id, path, start, end };
  part.update = newValue => set(part, newValue);
  part.addDisposer = handler => {
    if (typeof handler === "function" && disposers.indexOf(handler) === -1) {
      disposers.push(handler);
    }
  };
  part.removeDisposer = handler => {
    const index = disposers.indexOf(handler);
    if (index > -1) {
      disposers.splice(index, 1);
    }
  }
  return part;
}

// TODO: check if attribute part has svg parent, add this bool to part paths, for set() to use setAttributeNS()...
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
            parts.push(Part(adjustedPath));
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
          parts.push(Part(walkPath.concat(attr.nodeName)));
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

function updateNode(part, value) {
  const element = part.start;
  const parent = element.parentNode;
  if (element !== value) {
    parent.replaceChild(value, flushPart(part));
    part.start = part.end = value;
  }
}

function updateTextNode(part, value) {
  const element = part.start;
  const parent = element.parentNode;
  if (part.start !== part.end) {
    flushPart(part);
  }
  if (element.nodeType === TEXT_NODE && element.nodeValue !== value) {
    element.nodeValue = value;
  } else if (element.nodeType !== TEXT_NODE) {
    const newNode = document.createTextNode(value);
    parent.replaceChild(newNode, element);
    part.start = part.end = newNode;
  }
}

function flushPart(part) {
  const start = part.start;
  const parent = start.parentNode;
  const end = part.end;
  if (start === end) {
    return start;
  }
  let curr = end != null ? end.previousSibling : null;
  while (curr != null && curr !== start) {
    const nextNode = curr.previousSibling;
    parent.removeChild(curr);
    curr = nextNode;
  }
  return start;
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
  const start = part.start;
  const end = part.end;
  if (typeof end === "string") {
    updateAttribute(start, end, value);
  } else {
    if (value.then) {
      value.then(promised => {
        set(part, promised);
      });
    } else if (value.values && value.update) {
      render(value, start, part);
    } else if (Array.isArray(value)) {
      updateArray(part, value);
    } else if (value.nodeType) {
      updateNode(part, value);
    } else {
      updateTextNode(part, value);
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

function TemplateResult(key, template, parts, exprs) {
  const result = {
    key,
    fragment: null,
    values: exprs,
    parts,
    dispose() {
      parts.forEach(part =>
        part.disposers.forEach(
          dispose => typeof dispose === "function" && dispose()
        )
      );
    },
    update(values) {
      if (values != null) {
        result.values = values;
      }
      if (!result.fragment) {
        result.fragment = document.importNode(template, true);
        parts.forEach(part => {
          const target = followPath(result.fragment.content, part.path);
          if (Array.isArray(target)) {
            part.start = target[0];
            part.end = target[1];
          } else {
            part.start = target;
          }
          part.update = newValue => set(part, newValue);
        });
      }
      parts.forEach((part, i) => {
        const target = part.start;
        const expression = result.values[i];
        if (isDirective(target, expression)) {
          expression(part);
        } else {
          set(part, expression);
        }
      });
    }
  };
  return result;
}
/*
function hex(buffer) {
  const hexCodes = [];
  const padding = "00000000";
  const view = new DataView(buffer);
  for (var i = 0; i < view.byteLength; i += 4) {
    hexCodes.push(
      (padding + view.getUint32(i).toString(16)).slice(-padding.length)
    );
  }
  return hexCodes.join("");
}

let utf8er;
function sha256(str) {
  if (utf8er == null) {
    utf8er = new window.TextEncoder("utf-8");
  }
  return window.crypto.subtle
    .digest("SHA-256", utf8er.encode(str))
    .then(hash => {
      return hex(hash);
    });
}
*/

function parseSerializedParts(value) {
  if (value.startsWith("{{ps:") && value.endsWith("}}")) {
    return JSON.parse(value.split("{{ps:")[1].slice(0, -2));
  } else {
    return [];
  }
}

function isFirstChildSerializedParts(parent) {
  const child = parent.firstChild;
  return (
    child.nodeType === COMMENT_NODE &&
    child.nodeValue.startsWith("{{parts:") &&
    child.nodeValue.endsWith("}}")
  );
}

function checkForSerialized(hash) {
  const template = document.getElementById(`template-${hash}`);
  // <!--{{parts:[[0,1,1],...]}}-->
  const parts =
    template != null && isFirstChildSerializedParts(template.content)
      ? parseSerializedParts(
          template.content.removeChild(template.content.firstChild).nodeValue
        )
      : [];
  const result = { template, parts };
  template && templateCache.set(hash, result);
  return result;
}

export function html(strs, ...exprs) {
  const b64 = atob(strs);
  let { template, parts } = templateCache.get(b64) || checkForSerialized(b64);
  if (template == null) {
    template = document.createElement("template");
    template.innerHTML = strs.join("{{}}");
    walkDOM(template.content, null, templateSetup(parts));
    templateCache.set(b64, { template, parts });
  }

  return TemplateResult(strs, template, parts, exprs);
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

function defaultTemplateFn(item) {
  return html`${item.value}`;
}

const keyMapCache = new Map();
export function repeat(
  items,
  keyFn = defaultKeyFn,
  templateFn = defaultTemplateFn
) {
  return part => {
    const id = part.id;
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
      part.update(templates);
    } else {
      const newMap = items.map(item => keyFn(item));
      // TODO: do key comparisons here to efficiently add/move/remove dom nodes
    }
  };
}

function updateArray(part, value) {
  // TODO: add logic for rendering arrays...
}
