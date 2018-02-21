import {
  EMPTY_STRING,
  fail,
  Optional,
  PART_END,
  PART_START,
  SVG_NS
} from "./common";
import { IDirective, repeat } from "./directives";
import { Disposable } from "./Disposable";
import { DomTarget } from "./DomTarget";
import {
  isAttributePart,
  isDirective,
  isDocumentFragment,
  isEventPart,
  isFunction,
  isIterable,
  isNode,
  isPromise,
  isString,
  isTemplate,
  isTemplateElement,
  isTemplateGenerator,
  isText
} from "./predicates";
import { ITemplateGenerator, Template } from "./Template";

export type Key = symbol | string | number;
export type PrimitivePart =
  | boolean
  | number
  | string
  | Node
  | DocumentFragment
  | Function;
export type PartValue =
  | PrimitivePart
  | IPartPromise
  | IDirective
  | IPartArray
  | ITemplateGenerator;
export interface IPartPromise extends Promise<PartValue> {}
export interface IPartArray extends Array<PartValue> {}
export type KeyFn = (item: any, index?: number) => Key;
export type TemplateFn = (item: any) => ITemplateGenerator;

export class Part {
  public value: PartValue | Template;
  public path: Array<string | number>;
  public disposable = new Disposable();
  public target: DomTarget;
  constructor(
    path: Array<string | number>,
    target: Node,
    index: number = -1,
    public isSVG: boolean = false
  ) {
    this.target = new DomTarget(target);
    this.path = path.slice(0);
    this.value = target;
  }
  public update(value?: PartValue) {
    if (arguments.length === 0 && !isTemplate(this.value)) {
      value = this.value;
    }
    if (isDirective(value)) {
      (value as IDirective)(this);
      return;
    }
    if (isPromise(value)) {
      (value as Promise<PartValue>).then(promised => {
        this.update(promised);
      });
      return;
    }
    if (isAttributePart(this)) {
      this.updateAttribute(this, value);
    } else {
      if (isIterable(value)) {
        value = Array.from(value as any);
      }
      if (Array.isArray(value)) {
        this.updateArray(this, value);
      }
      if (isTemplateGenerator(value)) {
        this.updateTemplate(this, value as ITemplateGenerator);
      } else {
        this.updateNode(this, value);
      }
    }
  }
  private updateAttribute(part: Part, value: Optional<PartValue>) {
    const element = part.target.start as Node;
    if (!element) {
      fail();
    }
    const name = part.path[part.path.length - 1] as string;
    const isSVG = part.isSVG;
    if (!name) {
      fail();
    }
    const isValFn = isFunction(value);
    if ((isEventPart(part) && isValFn) || (name in element && !isSVG)) {
      try {
        (element as any)[name] =
          !value && value !== false ? EMPTY_STRING : value;
      } catch (_) {} // eslint-disable-line
    }
    if (!isValFn) {
      if (!value) {
        if (isSVG) {
          (element as HTMLElement).removeAttributeNS(SVG_NS, name);
        } else {
          (element as HTMLElement).removeAttribute(name);
        }
      } else {
        if (isSVG) {
          (element as HTMLElement).setAttributeNS(
            SVG_NS,
            name,
            value as string
          );
        } else {
          (element as HTMLElement).setAttribute(name, value as string);
        }
      }
    }
  }

  private updateArray(part: Part, value: Optional<PartValue[]>) {
    if (!value) {
      return;
    }
    const directive = repeat(value);
    part.value = directive;
    return directive(part);
  }

  private updateTemplate(part: Part, value: ITemplateGenerator) {
    const first = part.target.first();
    const parent = first.parentNode;
    if (!parent) {
      fail();
    }
    const instance = isTemplate(part.value) ? part.value : undefined;
    if (instance && (instance as Template).id === value.id) {
      (instance as Template).update(value.exprs);
      return;
    }
    const template = value();
    if (isTemplateElement(template.element)) {
      const fragment = template.element.content;
      const newStart = template.target.first();
      const newEnd = template.target.last();
      (parent as Node).insertBefore(fragment, first);
      part.target.start = newStart;
      part.target.end = newEnd;
      part.value = template;
    } else {
      fail();
    }
  }

  private updateNode(part: Part, value: Optional<PartValue>) {
    // Error condition: isText(part.value) && isNode(value) -> doesn't remove the text node...
    if (value == null) {
      value = document.createComment(`${PART_START}${PART_END}`);
    }
    const first = part.target.first();
    const parent = first.parentNode;
    if (parent == null) {
      fail();
    }
    let newStart: Optional<Node> = undefined;
    let newEnd: Optional<Node> = undefined;
    const partValue = part.value;
    if (!isNode(value)) {
      // string or coerce to string
      value =
        !isString(value) && isFunction(value.toString)
          ? value.toString()
          : value;
      if (!isString(value)) {
        fail();
      }
      if (isText(partValue)) {
        if (partValue.nodeValue !== value) {
          partValue.nodeValue = value as string;
        }
      } else {
        value = document.createTextNode(value as string);
        newStart = value;
        newEnd = value;
      }
    }
    if (!isNode(value)) {
      fail();
    }
    if (value !== partValue) {
      if (!isText(value)) {
        const isFrag = isDocumentFragment(value);
        newStart = isFrag ? (value as Node).firstChild : (value as Node);
        newEnd = isFrag ? (value as Node).lastChild : (value as Node);
      }
      // TODO: figure out why it's removing the wrong nodes here...
      (parent as Node).insertBefore(value as Node, first);
      // part.remove();
      part.value = value;
      // part.start = newStart;
      // part.end = newEnd;
    }
  }
}
