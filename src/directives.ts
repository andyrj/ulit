import { DIRECTIVE, fail } from "./common";
import { isTemplate, isTemplateElement } from "./predicates";
import {
  html,
  ITemplateGenerator,
  Key,
  KeyFn,
  Part,
  PartValue,
  Template,
  TemplateFn
} from "./ulit";

export interface IDirective {
  (part: Part): void;
  kind: string;
}

export type DirectiveFn = (part: Part) => void;
export function Directive(fn: DirectiveFn): IDirective {
  (fn as any).kind = DIRECTIVE;
  return fn as IDirective;
}

export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: PartValue): ITemplateGenerator {
  return html`${item}`;
}
const repeatCache = new Map<Part, [Key[], Map<Key, Template>]>();
export function repeat(
  items: Array<{}>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): IDirective {
  return Directive((part: Part) => {
    const target = part.first();
    const parent = target.parentNode;
    if (!parent) {
      fail();
    }
    // const isSVG = part.isSVG;
    // might need for hydrate...
    // const attacher = partAttachers.get(part);
    const templates = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    }) as Template[];
    const keys = items.map((item, index) => keyFn(item, index));
    const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [
      [],
      new Map<Key, Template>()
    ];
    const newCache = [keys, new Map<Key, Template>()];
    const newCacheMap = newCache[1] as Map<Key, Template>;
    // build LUT for new keys/templates
    keys.forEach((key, index) => {
      newCacheMap.set(key, templates[index]);
    });
    // remove keys no longer in keys/list
    const removeKeys: number[] = [];
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
          fail();
        }
        const first = oldEntry.first();
        if (key === oldCacheOrder[index]) {
          // update in place
          if (oldEntry.id === nextTemplate.id) {
            oldEntry.update(nextTemplate.values as PartValue[]);
          } else {
            //  maybe at some point think about diffing between templates?
            nextTemplate.update();
            if (isTemplateElement(nextTemplate.element)) {
              const fragment = nextTemplate.element.content;
              (parent as Node).insertBefore(fragment, first);
              oldEntry.remove();
              oldCacheMap.set(key, nextTemplate);
            } else {
              fail();
            }
          }
        } else {
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

export function until(
  promise: Promise<PartValue>,
  defaultContent: PartValue
): IDirective {
  return Directive((part: Part) => {
    part.update(defaultContent);
    promise.then(value => part.update(value));
  });
}
