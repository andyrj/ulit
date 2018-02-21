declare module "Disposable" {
    export type IDisposer = () => void;
    export class Disposable {
        disposers: IDisposer[];
        constructor();
        addDisposer(handler: IDisposer): void;
        removeDisposer(handler: IDisposer): void;
        dispose(): void;
    }
}
declare module "common" {
    export type Optional<T> = T | undefined | null;
    export const SVG = "SVG";
    export const SVG_NS = "http://www.w3.org/2000/svg";
    export const FOREIGN_OBJECT = "FOREIGNOBJECT";
    export const PART_START = "{{";
    export const PART_END = "}}";
    export const PART = "part";
    export const SERIAL_PART_START: string;
    export const PART_MARKER: string;
    export const TEMPLATE = "template";
    export const DIRECTIVE = "directive";
    export const ULIT = "ulit";
    export const ELEMENT_NODE = 1;
    export const TEXT_NODE = 3;
    export const COMMENT_NODE = 8;
    export const DOCUMENT_FRAGMENT = 11;
    export const EMPTY_STRING = "";
    export function fail(msg?: Optional<string>): never;
    export type WalkFn = (parent: Node, element: Optional<Node>, path: Array<string | number>) => boolean;
    export function walkDOM(parent: HTMLElement | DocumentFragment, element: Optional<Node>, fn: WalkFn, path?: Array<number | string>): void;
    export function getId(str: string): number;
}
declare module "Template" {
    import { Optional, WalkFn } from "common";
    import { Disposable } from "Disposable";
    import { DomTarget } from "DomTarget";
    import { Part, PartValue } from "Part";
    export interface ISerialCacheEntry {
        template: HTMLTemplateElement;
        serializedParts: ISerializedPart[];
    }
    export type ISerializedPart = [Array<string | number>, boolean];
    export interface ITemplateGenerator {
        (values?: PartValue[]): Template;
        id: number;
        exprs: PartValue[];
    }
    export function templateSetup(serial: ISerializedPart[], parts: Part[]): WalkFn;
    export type NodeAttribute = [Node, string];
    export function followPath(target: Node, pointer: Array<string | number>): Optional<Node | NodeAttribute> | never;
    export class Template {
        id: number;
        element: HTMLTemplateElement;
        parts: Part[];
        values: PartValue[];
        disposable: Disposable;
        target: DomTarget;
        constructor(id: number, element: HTMLTemplateElement, parts: Part[], values: PartValue[]);
        hydrate(element: Node): void;
        update(newValues?: Optional<PartValue[]>): void;
    }
}
declare module "Part" {
    import { IDirective } from "directives";
    import { Disposable } from "Disposable";
    import { DomTarget } from "DomTarget";
    import { ITemplateGenerator, Template } from "Template";
    export type Key = symbol | string | number;
    export type PrimitivePart = boolean | number | string | Node | DocumentFragment | Function;
    export type PartValue = PrimitivePart | IPartPromise | IDirective | IPartArray | ITemplateGenerator;
    export interface IPartPromise extends Promise<PartValue> {
    }
    export interface IPartArray extends Array<PartValue> {
    }
    export type KeyFn = (item: any, index?: number) => Key;
    export type TemplateFn = (item: any) => ITemplateGenerator;
    export class Part {
        isSVG: boolean;
        value: PartValue | Template;
        path: Array<string | number>;
        disposable: Disposable;
        target: DomTarget;
        constructor(path: Array<string | number>, target: Node, index?: number, isSVG?: boolean);
        update(value?: PartValue): void;
        private updateAttribute(part, value);
        private updateArray(part, value);
        private updateTemplate(part, value);
        private updateNode(part, value);
    }
}
declare module "ulit" {
    import { Optional } from "common";
    import { PartValue } from "Part";
    import { ITemplateGenerator } from "Template";
    export function html(strings: TemplateStringsArray, ...expressions: PartValue[]): ITemplateGenerator;
    export function render(view: PartValue | PartValue[] | Iterable<PartValue>, container?: Optional<Node>): void;
}
declare module "directives" {
    import { ITemplateGenerator, Key, KeyFn, Part, PartValue, TemplateFn } from "ulit";
    export interface IDirective {
        (part: Part): void;
        kind: string;
    }
    export type DirectiveFn = (part: Part) => void;
    export function Directive(fn: DirectiveFn): IDirective;
    export function defaultKeyFn(index: number): Key;
    export function defaultTemplateFn(item: PartValue): ITemplateGenerator;
    export function repeat(items: Array<{}>, keyFn?: KeyFn, templateFn?: TemplateFn): IDirective;
    export function until(promise: Promise<PartValue>, defaultContent: PartValue): IDirective;
}
declare module "predicates" {
    import { IDirective } from "directives";
    import { ITemplateGenerator, Part, Template } from "ulit";
    export function isNode(x: any): x is Node;
    export function isElementNode(x: any): x is HTMLElement;
    export function isDirective(x: any): x is IDirective;
    export function isDocumentFragment(x: any): x is DocumentFragment;
    export function isComment(x: any): x is Comment;
    export function isFunction(x: any): x is Function;
    export function isString(x: any): x is string;
    export function isText(x: any): x is Text;
    export function isNumber(x: any): x is number;
    export function isIterable(x: any): x is Iterable<any>;
    export function isPartComment(x: any): x is Comment;
    export function isPromise(x: any): x is Promise<any>;
    export function isTemplate(x: any): x is Template;
    export function isTemplateElement(x: any): x is HTMLTemplateElement;
    export function isTemplateGenerator(x: any): x is ITemplateGenerator;
    export function isPart(x: any): x is Part;
    export function isAttributePart(x: any): boolean;
    export function isEventPart(x: any): boolean;
}
declare module "DomTarget" {
    import { Optional } from "common";
    import { Part } from "ulit";
    export class DomTarget {
        isSVG: boolean;
        start: Optional<Node | Part>;
        end: Optional<Node | Part>;
        constructor(target?: Node, isSVG?: boolean);
        first(): Node;
        last(): Node;
        remove(): DocumentFragment;
    }
}
