import {
  fail,
  getId,
  Optional,
  PART_MARKER,
  TEMPLATE,
  walkDOM
} from "./common";
import { defaultTemplateFn } from "./directives";
import { Part, PartValue } from "./Part";
import {
  isIterable,
  isPartComment,
  isTemplateElement,
  isTemplateGenerator
} from "./predicates";
import { ITemplateGenerator, Template, templateSetup } from "./Template";

export { repeat, until } from "./directives";
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
  const instance = (container as any).__template;
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

  if (container.hasChildNodes()) {
    // TODO: add hydration here...
  } else {
    template.update();
    if (isTemplateElement(template.element)) {
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
      template.target.start = newStart;
      template.target.end = newEnd;
      (container as any).__template = template;
    } else {
      fail();
    }
  }
}
