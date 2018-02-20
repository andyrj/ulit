import { fail, Optional, PART_MARKER, TEMPLATE } from "./common";
import { defaultTemplateFn } from "./directives";
import { Part, PartValue } from "./Part";
import {
  isIterable,
  isPartComment,
  isTemplateElement,
  isTemplateGenerator
} from "./predicates";
import {
  ITemplateGenerator,
  Template,
  templateSetup,
  walkDOM
} from "./Template";

const idCache = new Map<string, number>();
function getId(str: string): number {
  if (idCache.has(str)) {
    return idCache.get(str) as number;
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

export function html(
  strings: TemplateStringsArray,
  ...expressions: PartValue[]
): ITemplateGenerator {
  const id = getId(strings.toString());
  const markUp = strings.join(PART_MARKER);
  const factory = function(exprs: PartValue[]) {
    const templateGenerator = function() {
      const templateElement = document.createElement(
        TEMPLATE
      ) as HTMLTemplateElement;
      templateElement.innerHTML = markUp;
      const fragment = templateElement.content;
      // serial = {
      //   serializedParts: [],
      //   template: newTemplateEl.cloneNode() as HTMLTemplateElement
      // };
      const parts: Part[] = [];
      const serializedParts: Array<[Array<string | number>, boolean]> = [];
      walkDOM(fragment, undefined, templateSetup(serializedParts, parts));
      return new Template(id, templateElement, parts, exprs);
    };
    (templateGenerator as ITemplateGenerator).id = id;
    (templateGenerator as ITemplateGenerator).exprs = expressions;
    return templateGenerator as ITemplateGenerator;
  };
  return factory(expressions);
}

// const renderedCache = new WeakMap<Node | Part, Template>();
export function render(
  view: PartValue | PartValue[] | Iterable<PartValue>,
  container?: Optional<Node>
) {
  if (!container) {
    container = document.body;
  }
  if (isIterable(view)) {
    view = Array.from(view as any);
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view as PartValue);
    if (!isTemplateGenerator(view)) {
      fail();
    }
  }
  const instance = (container as any).__template; // renderedCache.get(container);
  // TODO: re-write with expanded if structure nested here for id test...
  if (instance) {
    if (instance.id === (view as ITemplateGenerator).id) {
      instance.update((view as ITemplateGenerator).exprs);
      return;
    } else {
      instance.remove();
      (container as any).__template = undefined;
    }
  }
  const template = (view as ITemplateGenerator)(
    (view as ITemplateGenerator).exprs
  );
  template.update();
  if (isTemplateElement(template.element)) {
    // TODO: add hydration here...
    const first: Optional<Node> = container.firstChild;
    const parent: Optional<Node> = container;
    const fragment = template.element.content;
    const fragmentFirst = fragment.firstChild;
    const fragmentLast = fragment.lastChild;
    const newStart = isPartComment(fragmentFirst)
      ? template.parts[0]
      : fragmentFirst;
    const newEnd = isPartComment(fragmentLast)
      ? template.parts[template.parts.length - 1]
      : fragmentLast;
    (parent as Node).insertBefore(fragment, first);
    // if (instance) {
    //   instance.remove();
    // }
    template.start = newStart;
    template.end = newEnd;
    (container as any).__template = template;
  } else {
    fail();
  }
}
