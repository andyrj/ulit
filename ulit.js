define("Disposable", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Disposable {
        constructor() {
            this.disposers = [];
        }
        addDisposer(handler) {
            const disposers = this.disposers;
            if (disposers.indexOf(handler) > -1) {
                return;
            }
            disposers.push(handler);
        }
        removeDisposer(handler) {
            const disposers = this.disposers;
            const index = disposers.indexOf(handler);
            if (index === -1) {
                return;
            }
            disposers.splice(index, 1);
        }
        dispose() {
            const disposers = this.disposers;
            while (disposers.length > 0) {
                disposers.pop()();
            }
        }
    }
    exports.Disposable = Disposable;
});
define("common", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SVG = "SVG";
    exports.SVG_NS = "http://www.w3.org/2000/svg";
    exports.FOREIGN_OBJECT = "FOREIGNOBJECT";
    exports.PART_START = "{{";
    exports.PART_END = "}}";
    exports.PART = "part";
    exports.SERIAL_PART_START = `${exports.PART_START}${exports.PART}s:`;
    exports.PART_MARKER = `${exports.PART_START}${exports.PART_END}`;
    exports.TEMPLATE = "template";
    exports.DIRECTIVE = "directive";
    exports.ULIT = "ulit";
    exports.ELEMENT_NODE = 1;
    exports.TEXT_NODE = 3;
    exports.COMMENT_NODE = 8;
    exports.DOCUMENT_FRAGMENT = 11;
    exports.EMPTY_STRING = "";
    function fail(msg) {
        if (msg) {
            throw new RangeError(msg);
        }
        else {
            throw new RangeError();
        }
    }
    exports.fail = fail;
    function walkDOM(parent, element, fn, path = []) {
        let condition = true;
        if (element) {
            condition = fn(parent, element, path);
        }
        else {
            element = parent;
        }
        if (!condition || !element) {
            fail();
        }
        [].forEach.call(element.childNodes, (child, index) => {
            path.push(index);
            walkDOM(element, child, fn, path);
            path.pop();
        });
    }
    exports.walkDOM = walkDOM;
    const idCache = new Map();
    function getId(str) {
        if (idCache.has(str)) {
            return idCache.get(str);
        }
        let id = 0;
        if (str.length > 0) {
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                id = (id << 5) - id + char;
                id = id & id;
            }
        }
        idCache.set(str, id);
        return id;
    }
    exports.getId = getId;
});
define("Template", ["require", "exports", "common", "Disposable", "DomTarget", "Part", "predicates"], function (require, exports, common_1, Disposable_1, DomTarget_1, Part_1, predicates_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isNodeSVGChild(node) {
        if (!node) {
            return false;
        }
        let result = false;
        let current = node;
        while (current) {
            if (current.nodeName === common_1.SVG) {
                result = true;
                current = undefined;
            }
            else if (current.nodeName === common_1.FOREIGN_OBJECT) {
                result = false;
                current = undefined;
            }
            else {
                current = current.parentNode;
            }
        }
        return result;
    }
    function isFirstChildSerial(parent) {
        const child = parent.firstChild;
        return (child &&
            child.nodeType === common_1.COMMENT_NODE &&
            child.nodeValue &&
            child.nodeValue.startsWith(common_1.SERIAL_PART_START));
    }
    function parseSerializedParts(value) {
        if (!value) {
            return [];
        }
        else {
            return JSON.parse(value.split(common_1.SERIAL_PART_START)[1].slice(0, -2));
        }
    }
    function getSerializedTemplate(id) {
        const el = document.getElementById(`${common_1.ULIT}${id}`);
        if (!el) {
            return;
        }
        const fragment = el.cloneNode(true).content;
        if (!fragment) {
            return;
        }
        const first = fragment.firstChild;
        if (!first) {
            return;
        }
        const isFirstSerial = isFirstChildSerial(fragment);
        let deserialized = undefined;
        if (isFirstSerial) {
            const fc = fragment.removeChild(first);
            const serializedParts = parseSerializedParts(fc.nodeValue || undefined);
            const template = el;
            if (serializedParts && template) {
                deserialized = { template, serializedParts };
            }
        }
        if (deserialized) {
            return deserialized;
        }
        return;
    }
    function templateSetup(serial, parts) {
        return (parent, element, walkPath) => {
            const isSVG = isNodeSVGChild(element);
            if (predicates_1.isText(element)) {
                const text = element && element.nodeValue;
                const split = text && text.split(common_1.PART_MARKER);
                const end = split ? split.length - 1 : undefined;
                const nodes = [];
                let cursor = 0;
                if (split && split.length > 0 && end) {
                    split.forEach((node, i) => {
                        if (node !== "") {
                            nodes.push(document.createTextNode(node));
                            cursor++;
                        }
                        if (i < end) {
                            const newPartComment = document.createComment(common_1.PART_MARKER);
                            nodes.push(newPartComment);
                            const adjustedPath = walkPath.slice(0);
                            const len = adjustedPath.length - 1;
                            adjustedPath[len] += cursor;
                            serial.push([adjustedPath, isSVG]);
                            parts.push(new Part_1.Part(adjustedPath, newPartComment, parts.length, isSVG));
                            cursor++;
                        }
                    });
                    nodes.forEach(node => {
                        parent.insertBefore(node, element);
                    });
                    if (!element) {
                        common_1.fail();
                    }
                    else {
                        parent.removeChild(element);
                    }
                }
            }
            else if (predicates_1.isElementNode(element)) {
                if (!element) {
                    common_1.fail();
                }
                else {
                    [].forEach.call(element.attributes, (attr) => {
                        if (attr.nodeValue === common_1.PART_MARKER) {
                            const attrPath = walkPath.concat(attr.nodeName);
                            serial.push([attrPath, isSVG]);
                            parts.push(new Part_1.Part(attrPath, element, parts.length, isSVG));
                        }
                    });
                }
            }
            return true;
        };
    }
    exports.templateSetup = templateSetup;
    function followPath(target, pointer) {
        if (!target) {
            throw new RangeError();
        }
        const cPath = pointer.slice(0);
        const current = cPath.shift();
        if (predicates_1.isNumber(current)) {
            if (cPath.length === 0) {
                return target.childNodes[current];
            }
            else {
                return followPath(target.childNodes[current], cPath);
            }
        }
        else if (predicates_1.isString(current)) {
            if (cPath.length === 0) {
                return [target, current];
            }
            else {
                common_1.fail();
            }
        }
        common_1.fail();
        return; // satisifying typescript, can't be reached anyways... ><
    }
    exports.followPath = followPath;
    class Template {
        constructor(id, element, parts, values) {
            this.id = id;
            this.element = element;
            this.parts = parts;
            this.values = values;
            this.disposable = new Disposable_1.Disposable();
            this.target = new DomTarget_1.DomTarget();
        }
        hydrate(element) {
            this.parts.forEach(part => {
                const target = followPath(element, part.path);
                if (!target) {
                    common_1.fail();
                }
                else {
                    const isArr = Array.isArray(target);
                    this.target.start = isArr
                        ? target
                        : target;
                    // this.target.end = isArr ? target as [Node, string][0]: target as Node;
                }
            });
        }
        update(newValues) {
            if (arguments.length === 0) {
                newValues = this.values;
            }
            const templateParts = this.parts;
            let i = 0;
            const len = templateParts.length;
            for (; i < len; i++) {
                const part = templateParts[i];
                const newVal = newValues ? newValues[i] : undefined;
                part.update(newVal);
            }
            if (newValues != null) {
                this.values = newValues;
            }
        }
    }
    exports.Template = Template;
});
define("Part", ["require", "exports", "common", "directives", "Disposable", "DomTarget", "predicates"], function (require, exports, common_2, directives_1, Disposable_2, DomTarget_2, predicates_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Part {
        constructor(path, target, index = -1, isSVG = false) {
            this.isSVG = isSVG;
            this.disposable = new Disposable_2.Disposable();
            this.target = new DomTarget_2.DomTarget(target);
            this.path = path.slice(0);
            this.value = target;
        }
        update(value) {
            if (arguments.length === 0 && !predicates_2.isTemplate(this.value)) {
                value = this.value;
            }
            if (predicates_2.isDirective(value)) {
                value(this);
                return;
            }
            if (predicates_2.isPromise(value)) {
                value.then(promised => {
                    this.update(promised);
                });
                return;
            }
            if (predicates_2.isAttributePart(this)) {
                this.updateAttribute(this, value);
            }
            else {
                if (predicates_2.isIterable(value)) {
                    value = Array.from(value);
                }
                if (Array.isArray(value)) {
                    this.updateArray(this, value);
                }
                if (predicates_2.isTemplateGenerator(value)) {
                    this.updateTemplate(this, value);
                }
                else {
                    this.updateNode(this, value);
                }
            }
        }
        updateAttribute(part, value) {
            const element = part.target.start;
            if (!element) {
                common_2.fail();
            }
            const name = part.path[part.path.length - 1];
            const isSVG = part.isSVG;
            if (!name) {
                common_2.fail();
            }
            const isValFn = predicates_2.isFunction(value);
            if ((predicates_2.isEventPart(part) && isValFn) || (name in element && !isSVG)) {
                try {
                    element[name] =
                        !value && value !== false ? common_2.EMPTY_STRING : value;
                }
                catch (_) { } // eslint-disable-line
            }
            if (!isValFn) {
                if (!value) {
                    if (isSVG) {
                        element.removeAttributeNS(common_2.SVG_NS, name);
                    }
                    else {
                        element.removeAttribute(name);
                    }
                }
                else {
                    if (isSVG) {
                        element.setAttributeNS(common_2.SVG_NS, name, value);
                    }
                    else {
                        element.setAttribute(name, value);
                    }
                }
            }
        }
        updateArray(part, value) {
            if (!value) {
                return;
            }
            const directive = directives_1.repeat(value);
            part.value = directive;
            return directive(part);
        }
        updateTemplate(part, value) {
            const first = part.target.first();
            const parent = first.parentNode;
            if (!parent) {
                common_2.fail();
            }
            const instance = predicates_2.isTemplate(part.value) ? part.value : undefined;
            if (instance && instance.id === value.id) {
                instance.update(value.exprs);
                return;
            }
            const template = value();
            if (predicates_2.isTemplateElement(template.element)) {
                const fragment = template.element.content;
                const newStart = template.target.first();
                const newEnd = template.target.last();
                parent.insertBefore(fragment, first);
                part.target.start = newStart;
                part.target.end = newEnd;
                part.value = template;
            }
            else {
                common_2.fail();
            }
        }
        updateNode(part, value) {
            // Error condition: isText(part.value) && isNode(value) -> doesn't remove the text node...
            if (value == null) {
                value = document.createComment(`${common_2.PART_START}${common_2.PART_END}`);
            }
            const first = part.target.first();
            const parent = first.parentNode;
            if (parent == null) {
                common_2.fail();
            }
            let newStart = undefined;
            let newEnd = undefined;
            const partValue = part.value;
            if (!predicates_2.isNode(value)) {
                // string or coerce to string
                value =
                    !predicates_2.isString(value) && predicates_2.isFunction(value.toString)
                        ? value.toString()
                        : value;
                if (!predicates_2.isString(value)) {
                    common_2.fail();
                }
                if (predicates_2.isText(partValue)) {
                    if (partValue.nodeValue !== value) {
                        partValue.nodeValue = value;
                    }
                }
                else {
                    value = document.createTextNode(value);
                    newStart = value;
                    newEnd = value;
                }
            }
            if (!predicates_2.isNode(value)) {
                common_2.fail();
            }
            if (value !== partValue) {
                if (!predicates_2.isText(value)) {
                    const isFrag = predicates_2.isDocumentFragment(value);
                    newStart = isFrag ? value.firstChild : value;
                    newEnd = isFrag ? value.lastChild : value;
                }
                // TODO: figure out why it's removing the wrong nodes here...
                parent.insertBefore(value, first);
                // part.remove();
                part.value = value;
                // part.start = newStart;
                // part.end = newEnd;
            }
        }
    }
    exports.Part = Part;
});
define("ulit", ["require", "exports", "common", "directives", "predicates", "Template"], function (require, exports, common_3, directives_2, predicates_3, Template_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function html(strings, ...expressions) {
        const id = common_3.getId(strings.toString());
        const markUp = strings.join(common_3.PART_MARKER);
        const factory = function (exprs) {
            const templateGenerator = function () {
                const templateElement = document.createElement(common_3.TEMPLATE);
                templateElement.innerHTML = markUp;
                const fragment = templateElement.content;
                // serial = {
                //   serializedParts: [],
                //   template: newTemplateEl.cloneNode() as HTMLTemplateElement
                // };
                const parts = [];
                const serializedParts = [];
                common_3.walkDOM(fragment, undefined, Template_1.templateSetup(serializedParts, parts));
                return new Template_1.Template(id, templateElement, parts, exprs);
            };
            templateGenerator.id = id;
            templateGenerator.exprs = expressions;
            return templateGenerator;
        };
        return factory(expressions);
    }
    exports.html = html;
    function render(view, container) {
        if (!container) {
            container = document.body;
        }
        if (predicates_3.isIterable(view)) {
            view = Array.from(view);
        }
        if (!predicates_3.isTemplateGenerator(view)) {
            view = directives_2.defaultTemplateFn(view);
            if (!predicates_3.isTemplateGenerator(view)) {
                common_3.fail();
            }
        }
        const instance = container.__template;
        // TODO: re-write with expanded if structure nested here for id test...
        if (instance) {
            if (instance.id === view.id) {
                instance.update(view.exprs);
                return;
            }
            else {
                instance.remove();
                container.__template = undefined;
            }
        }
        const template = view(view.exprs);
        if (container.hasChildNodes()) {
            // TODO: add hydration here...
        }
        else {
            template.update();
            if (predicates_3.isTemplateElement(template.element)) {
                const first = container.firstChild;
                const parent = container;
                const fragment = template.element.content;
                const fragmentFirst = fragment.firstChild;
                const fragmentLast = fragment.lastChild;
                const newStart = predicates_3.isPartComment(fragmentFirst)
                    ? template.parts[0]
                    : fragmentFirst;
                const newEnd = predicates_3.isPartComment(fragmentLast)
                    ? template.parts[template.parts.length - 1]
                    : fragmentLast;
                parent.insertBefore(fragment, first);
                template.target.start = newStart;
                template.target.end = newEnd;
                container.__template = template;
            }
            else {
                common_3.fail();
            }
        }
    }
    exports.render = render;
});
define("directives", ["require", "exports", "common", "predicates", "ulit"], function (require, exports, common_4, predicates_4, ulit_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function Directive(fn) {
        fn.kind = common_4.DIRECTIVE;
        return fn;
    }
    exports.Directive = Directive;
    function defaultKeyFn(index) {
        return index;
    }
    exports.defaultKeyFn = defaultKeyFn;
    function defaultTemplateFn(item) {
        return ulit_1.html `${item}`;
    }
    exports.defaultTemplateFn = defaultTemplateFn;
    const repeatCache = new Map();
    function repeat(items, keyFn = defaultKeyFn, templateFn = defaultTemplateFn) {
        return Directive((part) => {
            const target = part.first();
            const parent = target.parentNode;
            if (!parent) {
                common_4.fail();
            }
            // const isSVG = part.isSVG;
            // might need for hydrate...
            // const attacher = partAttachers.get(part);
            const templates = items.map(item => {
                if (predicates_4.isTemplate(item)) {
                    return item;
                }
                return templateFn(item);
            });
            const keys = items.map((item, index) => keyFn(item, index));
            const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [
                [],
                new Map()
            ];
            const newCache = [keys, new Map()];
            const newCacheMap = newCache[1];
            // build LUT for new keys/templates
            keys.forEach((key, index) => {
                newCacheMap.set(key, templates[index]);
            });
            // remove keys no longer in keys/list
            const removeKeys = [];
            oldCacheOrder.forEach((key, index) => {
                const newEntry = newCacheMap.get(key);
                const oldEntry = oldCacheMap.get(key);
                if (oldEntry && !newEntry) {
                    oldEntry.remove();
                    oldCacheMap.delete(key);
                    removeKeys.push(index);
                }
            });
            // can't mutate oldCacheOrder while in forEach
            while (true) {
                const index = removeKeys.pop();
                if (index && index > -1) {
                    oldCacheOrder.splice(index, 1);
                    continue;
                }
                break;
            }
            // move/update and add
            keys.forEach((key, index) => {
                const oldEntry = oldCacheMap.get(key);
                const nextTemplate = templates[index];
                if (oldEntry) {
                    if (!parent) {
                        common_4.fail();
                    }
                    const first = oldEntry.first();
                    if (key === oldCacheOrder[index]) {
                        // update in place
                        if (oldEntry.id === nextTemplate.id) {
                            oldEntry.update(nextTemplate.values);
                        }
                        else {
                            //  maybe at some point think about diffing between templates?
                            nextTemplate.update();
                            if (predicates_4.isTemplateElement(nextTemplate.element)) {
                                const fragment = nextTemplate.element.content;
                                parent.insertBefore(fragment, first);
                                oldEntry.remove();
                                oldCacheMap.set(key, nextTemplate);
                            }
                            else {
                                common_4.fail();
                            }
                        }
                    }
                    else {
                        // TODO: look at this code again with fresh eyes...
                        // const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
                        // if (!targetEntry) {
                        //   fail();
                        // } else {
                        //   target = targetEntry.first();
                        //   const oldIndex = oldCacheOrder.indexOf(key);
                        //   oldCacheOrder.splice(oldIndex, 1);
                        //   oldCacheOrder.splice(index, 0, key);
                        //   const fragment = oldEntry.remove();
                        //   if (oldEntry.id === nextTemplate.id) {
                        //     oldEntry(nextTemplate.values as PartValue[]);
                        //     (parent as Node).insertBefore(fragment, target);
                        //   } else {
                        //     nextTemplate();
                        //     // nextTemplate.insertBefore(target);
                        //     (parent as Node).insertBefore(fragment, target);
                        //   }
                        // }
                    }
                    return;
                }
                // add template to
                // TODO: look over this logic and clean it up...
                // const cursor = oldCacheOrder[index];
                // oldEntry = oldCacheMap.get(cursor);
                // const firstNode = part.first();
                // if (index === 0 && isPartComment(firstNode) && !cursor && !oldEntry) {
                //   if (isTemplateElement(nextTemplate.element)) {
                //     const fragment = nextTemplate.element.content;
                //     (parent as Node).insertBefore(fragment, firstNode);
                //     if (!parent) {
                //       fail();
                //     } else {
                //       parent.removeChild(firstNode);
                //       oldCacheOrder.push(key);
                //     }
                //   } else {
                //     fail();
                //   }
                // } else {
                //   if (!oldEntry) {
                //     fail();
                //   } else {
                //     // nextTemplate.insertBefore(oldEntry);
                //     oldCacheOrder.splice(index, 0, key);
                //   }
                // }
                // oldCacheMap.set(key, nextTemplate);
            });
        });
    }
    exports.repeat = repeat;
    function until(promise, defaultContent) {
        return Directive((part) => {
            part.update(defaultContent);
            promise.then(value => part.update(value));
        });
    }
    exports.until = until;
});
define("predicates", ["require", "exports", "common", "ulit"], function (require, exports, common_5, ulit_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isNode(x) {
        return x && x.nodeType > 0;
    }
    exports.isNode = isNode;
    function isElementNode(x) {
        return isNode(x) && x.nodeType === common_5.ELEMENT_NODE;
    }
    exports.isElementNode = isElementNode;
    function isDirective(x) {
        return isFunction(x) && x.kind === common_5.DIRECTIVE;
    }
    exports.isDirective = isDirective;
    function isDocumentFragment(x) {
        return isNode(x) && x.nodeType === common_5.DOCUMENT_FRAGMENT;
    }
    exports.isDocumentFragment = isDocumentFragment;
    function isComment(x) {
        return isNode(x) && x.nodeType === common_5.COMMENT_NODE;
    }
    exports.isComment = isComment;
    function isFunction(x) {
        return typeof x === "function";
    }
    exports.isFunction = isFunction;
    function isString(x) {
        return typeof x === "string";
    }
    exports.isString = isString;
    function isText(x) {
        return x && isNode(x) && x.nodeType === common_5.TEXT_NODE;
    }
    exports.isText = isText;
    function isNumber(x) {
        return typeof x === "number";
    }
    exports.isNumber = isNumber;
    function isIterable(x) {
        return (!isString(x) && !Array.isArray(x) && isFunction(x[Symbol.iterator]));
    }
    exports.isIterable = isIterable;
    function isPartComment(x) {
        return isComment(x) && x.textContent === common_5.PART_MARKER;
    }
    exports.isPartComment = isPartComment;
    function isPromise(x) {
        return x && isFunction(x.then);
    }
    exports.isPromise = isPromise;
    function isTemplate(x) {
        return x && x instanceof ulit_2.Template;
    }
    exports.isTemplate = isTemplate;
    function isTemplateElement(x) {
        return x && x instanceof HTMLTemplateElement;
    }
    exports.isTemplateElement = isTemplateElement;
    function isTemplateGenerator(x) {
        return isFunction(x) && x.id;
    }
    exports.isTemplateGenerator = isTemplateGenerator;
    function isPart(x) {
        return x && x instanceof ulit_2.Part;
    }
    exports.isPart = isPart;
    function isAttributePart(x) {
        if (isPart(x) && isString(x.path[x.path.length - 1])) {
            return true;
        }
        return false;
    }
    exports.isAttributePart = isAttributePart;
    function isEventPart(x) {
        if (isAttributePart(x) && x.path[x.path.length - 1].startsWith("on")) {
            return true;
        }
        return false;
    }
    exports.isEventPart = isEventPart;
});
define("DomTarget", ["require", "exports", "common", "predicates"], function (require, exports, common_6, predicates_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class DomTarget {
        constructor(target, isSVG = false) {
            this.isSVG = isSVG;
            this.start = undefined;
            this.end = undefined;
            if (target) {
                this.start = target;
                this.end = target;
            }
        }
        first() {
            const start = this.start;
            if (!start || !this.end) {
                common_6.fail();
            }
            if (predicates_5.isNode(start)) {
                return start;
            }
            else {
                return start.target.first();
            }
        }
        last() {
            const end = this.end;
            if (!end || !this.start) {
                common_6.fail();
            }
            if (predicates_5.isNode(end)) {
                return end;
            }
            else {
                return end.target.last();
            }
        }
        remove() {
            if (!this.start || !this.end) {
                common_6.fail();
            }
            const fragment = document.createDocumentFragment();
            const last = this.last();
            let cursor = this.first();
            while (cursor != null) {
                const next = cursor.nextSibling;
                fragment.appendChild(cursor);
                cursor = cursor === last || !next ? undefined : next;
            }
            return fragment;
        }
    }
    exports.DomTarget = DomTarget;
});
//# sourceMappingURL=ulit.js.map