import { Optional } from "./common";
import { isNode } from "./predicates";

export class DomTarget {
  public start: Optional<Node | DomTarget> = undefined;
  public end: Optional<Node | DomTarget> = undefined;
  constructor(target?: Node, public isSVG: boolean = false) {
    if (target) {
    }
  }
  public first(): Node {
    const start = this.start;
    if (isNode(start)) {
      return start;
    } else {
      return (start as DomTarget).first();
    }
  }
  public last(): Node {
    const end = this.end;
    if (isNode(end)) {
      return end;
    } else {
      return (end as DomTarget).last();
    }
  }
  public remove(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const end = this.last();
    let cursor: Optional<Node> = this.first();
    while (cursor != null) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = cursor === end || !next ? undefined : next;
    }
    return fragment;
  }
}
