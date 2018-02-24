import { expect } from "chai";
import "mocha";
import { Directive, Disposable, DomTarget, html, IDisposer, Part, render, Template } from "../src/ulit";

describe("Template", () => {
  it("should have {disposable, target, id, element, parts, values}", () => {
    const test1 = new Template(1, document.createElement("template"), [], []);
    expect(test1.disposable !== undefined).to.equal(true);
    expect(test1.target !== undefined).to.equal(true);
    expect(test1.id !== undefined).to.equal(true);
    expect(test1.element !== undefined).to.equal(true);
    expect(test1.parts !== undefined).to.equal(true);
    expect(test1.values !== undefined).to.equal(true);
  });

  // TODO: add more tests for Template
});

describe("Part", () => {
  it("should have {value, path, disposable, target, isSVG}", () => {
    const fragment = document.createDocumentFragment();
    const target = document.createElement("div");
    fragment.appendChild(target);
    const test1 = new Part([0], target);
    expect(test1.value !== undefined).to.equal(true);
    expect(test1.path !== undefined).to.equal(true);
    expect(test1.disposable !== undefined).to.equal(true);
    expect(test1.target !== undefined).to.equal(true);
    expect(test1.isSVG !== undefined).to.equal(true);
  });

  // TODO: add more tests for Part
  it("update should replace initial comment node", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    expect(fragment.firstChild.nodeType).to.equal(8);
    part.update();
    expect(fragment.firstChild.nodeType).to.equal(8);
    part.update("test");
    expect(fragment.firstChild.nodeType).to.equal(3);
  });

  it("update should correctly update text nodes", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    expect(fragment.firstChild.nodeType).to.equal(8);
    const str = "test";
    part.update(str);
    expect(fragment.firstChild.nodeType).to.equal(3);
    expect(fragment.firstChild.nodeValue).to.equal(str);
    const str2 = "test123";
    part.update(str2);
    expect(fragment.firstChild.nodeValue).to.equal(str2);    
  });

  it("update should correctly handle dom nodes", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    expect(fragment.firstChild.nodeType).to.equal(8);
    const div = document.createElement("div");
    const span = document.createElement("span");
    part.update(div);
    expect(fragment.firstChild).to.equal(div);
    part.update(span);
    expect(fragment.firstChild).to.equal(span);
  });

  it("update should correctly handle document fragments", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    expect(fragment.firstChild.nodeType).to.equal(8);
    const frag1 = document.createDocumentFragment();
    const frag2 = document.createDocumentFragment();
    const div1 = document.createElement("div");
    const span1 = document.createElement("span");
    const br1 = document.createElement("br");
    const div2 = document.createElement("div");
    const span2 = document.createElement("span");
    const br2 = document.createElement("br");
    frag1.appendChild(div1);
    frag1.appendChild(span1);
    frag1.appendChild(br1);
    frag2.appendChild(div2);
    frag2.appendChild(span2);
    frag2.appendChild(br2);
    part.update(frag1);
    expect(fragment.firstChild).to.equal(div1);
    expect(fragment.firstChild.nextSibling).to.equal(span1);
    expect(fragment.firstChild.nextSibling.nextSibling).to.equal(br1);
    part.update(frag2);
    expect(fragment.firstChild).to.equal(div2);
    expect(fragment.firstChild.nextSibling).to.equal(span2);
    expect(fragment.firstChild.nextSibling.nextSibling).to.equal(br2);
  });

  it("update should correctly handle Directives", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    part.update();
    expect(fragment.firstChild.nodeType).to.equal(8);
    let directivePart;
    const directive = Directive((p) => { directivePart = p; });
    part.update(directive);
    expect(fragment.firstChild.nodeType).to.equal(8);
    directivePart.update("test");
    expect(fragment.firstChild.nodeType).to.equal(3);
  });

  it("update should correctly handle promises", done => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, 0, false);
    part.update();
    expect(fragment.firstChild.nodeType).to.equal(8);
    part.update(new Promise((resolve, reject) => {
      resolve("test");
      done();
    }));
    expect(fragment.firstChild.nodeType).to.equal(8);
    setTimeout(expect(fragment.firstChild.nodeType).to.equal(3), 600);
  });
});

describe("DomTarget", () => {
  it("should have {start, end, isSVG}", () => {
    const test = new DomTarget();
    expect(test.start).to.equal(undefined);
    expect(test.end).to.equal(undefined);
    const keys = Object.keys(test);
    expect(keys.indexOf("end") > -1 && keys.indexOf("start") > -1).to.equal(true);
    expect(test.isSVG).to.equal(false);
  });
  it("should initially set start and end to target in constructor", () => {
    const comment = document.createComment("{{}}");;
    const test = new DomTarget(comment);
    expect(test.start).to.equal(comment);
    expect(test.end).to.equal(comment);
  });
  it("should properly identify first and last", () => {
    const fragment = document.createDocumentFragment();
    const partNode = document.createComment("{{}}");
    fragment.appendChild(partNode);
    const t1 = new DomTarget();
    t1.start = new Part([0], partNode, 0, false);
    t1.end = new Part([1], partNode, 0, false);
    expect(t1.first()).to.equal(partNode);
    expect(t1.last()).to.equal(partNode);
    t1.start = partNode;
    t1.end = partNode;
    expect(t1.first()).to.equal(partNode);
    expect(t1.last()).to.equal(partNode);
  });
  it("should proplery remove itself from the dom", () => {
    const fragment = document.createDocumentFragment();
    const partNode = document.createComment("{{1}}");
    fragment.appendChild(partNode);
    const t1 = new DomTarget(partNode);
    expect(t1.remove().firstChild.nodeValue).to.equal("{{1}}");
    fragment.appendChild(partNode);
    const partNode1 = document.createComment("{{2}}");
    fragment.appendChild(partNode1);
    t1.start = partNode;
    t1.end = partNode1;
    const removedFragment = t1.remove();
    expect(removedFragment.firstChild).to.equal(partNode);
    expect(removedFragment.lastChild).to.equal(partNode1);
  })
});

describe("Disposable", () => {
  it("should have {add,remove}Disposer", () => {
    const test = new Disposable();
    expect(typeof test.addDisposer).to.equal("function");
    expect(typeof test.removeDisposer).to.equal("function");
  });
  it("should have dispose method", () => {
    const test = new Disposable();
    expect(typeof test.dispose).to.equal("function");
  });
  it("should call any disposers added when dispose is called", () => {
    let count = 0;
    const handler: IDisposer = () => {
      count++;
    };
    const test = new Disposable();
    test.addDisposer(handler);
    test.addDisposer(handler); // repeats are ignored
    test.dispose();
    expect(count).to.equal(1);
  });
  it("should not call a disposer after it is removed", () => {
    let count = 0;
    const handler: IDisposer = () => {
      count++;
    };
    const test = new Disposable();
    test.addDisposer(handler);
    test.removeDisposer(handler);
    test.removeDisposer(handler); // repeats are ignored
    test.dispose();
    expect(count).to.equal(0);
  });
});

/* TODO: remove this was only useful when I refactored to start from bottom up instead of top down...
describe("common", () => {
  it("should throw anytime fail is called", () => {
    const fn = () => fail("test");
    expect(fail).to.throw();
    expect(fn).to.throw();
  });

  it("should always generate the same id for the same string", () => {
    const str1 = "test1";
    const str2 = "test2";
    const result1 = getId(str1);
    const result2 = getId(str2);
    expect(getId(str1)).to.equal(result1);
    expect(getId(str2)).to.equal(result2);
  });

  it("walkDOM should traverse all nodes in tree", () => {
    const fragment = document.createDocumentFragment();
    const d1 = document.createElement("div");
    d1.appendChild(document.createElement("div"));
    fragment.appendChild(d1);
    fragment.appendChild(document.createElement("div"));
    fragment.appendChild(document.createElement("div"));
    let count = 0;
    const walkIt: WalkFn = () => {
      count++;
      return true;
    };
    walkDOM(fragment, undefined, walkIt);
    expect(count).to.equal(4);
  });

  it("walkDOM should throw if WalkFn throws", () => {
    const fragment = document.createDocumentFragment();
    const div = document.createElement("div");
    fragment.appendChild(div);
    const errWalkFn: WalkFn = (parent, element, path) => {
      throw new Error()
    };
    expect(() => walkDOM(fragment, undefined, errWalkFn)).to.throw();
  });
});
*/
describe("render", () => {
  it("should handle static templates", () => {
    const test1 = html`<div id="test">test</div>`;
    render(test1);
    expect(document.body.innerHTML).to.equal(`<div id="test">test</div>`);
  });
  it("should handle defaultTemplateFn", () => {
    const test2 = "test2";
    const div = document.createElement("div");
    render(test2);
    expect(document.body.innerHTML).to.equal(test2);
    render(html`${div}`);
    expect(document.body.firstChild).to.equal(div);
  });
  it("setting event handler should work", () => {
    const handler = (e: any) => {};
    const template = html`<div onclick=${handler}>test</div>`;
    render(template);
    expect((document.body.firstChild as any).onclick !== undefined).to.equal(true);
  });
  /*
  it("should handle attribute parts", () => {
    const str = "test3";
    const test3 = val => html`<div id=${val}></div>`;
    render(test3(str));
    expect(document.body.innerHTML).to.equal(`<div id="${str}"></div>`);  
    render(test3(null));
    expect(document.body.innerHTML).to.equal(`<div></div>`);
  });
  it("expression can change part types between renders", () => {
    const str = "test";
    const div = document.createElement("div");
    div.id = "test";
    const test3 = val => html`${val}`;
    render(test3(str));
    expect(document.body.innerHTML).to.equal("test");
    render(test3(div));
    expect(document.body.innerHTML).to.equal(`<div id="test"></div>`);
  });
  it("should handle single node templates", () => {
    const str = "test";
    const test4 = val => html`${val}`;
    render(test4(str));
    expect(document.body.innerHTML).to.equal(`test`);
  });
  
  it("should handle dynamic nodes dispersed in static nodes", () => {
    const str = "dynamic";
    const template = html`<div>This is static, this is ${str}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div>This is static, this is ${str}</div>`);
    const template1 = html`<div>${str} is at start</div>`;
    render(template1);
    expect(document.body.innerHTML).to.equal(`<div>${str} is at start</div>`);
    const template2 = html`<div>in the middle it's ${str}!</div>`;
    render(template2);
    expect(document.body.innerHTML).to.equal(`<div>in the middle it's ${str}!</div>`);
  });
  
  it("nested templates", () => {
    const nested = html`<div id="test">test</div>`;
    const template = html`<div>${nested}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div><div id="test">test</div></div>`);
    const template1 = html`<span>${template}</span>`;
    render(template1);
    expect(document.body.innerHTML).to.equal(`<span><div><div id="test">test</div></div></span>`);
  });
  
  it("nested templates should update in place", () => {
    const nested = (str: string) => html`<div class=nested>${str}</div>`;
    const template = (str: string) => html`<div>${nested(str)}</div>`;
    render(template("test"));
    expect((document.body.firstChild as any).firstChild.firstChild.nodeValue).to.equal("test");
    render(template("123"));
    expect((document.body.firstChild as any).firstChild.firstChild.nodeValue).to.equal("123");
  });
  
  it("attribute directives should work as expected", () => {
    const template = (str: string) => html`<div id=${Directive(part => part.update(str))}>test</div>`;
    render(template("test"));
    expect((document.body.firstChild as any).id).to.equal("test");
    render(template("test1"));
    expect((document.body.firstChild as any).id).to.equal("test1");
  });
  
  it("templates should be able to start and end with parts", () => {
    const t1 = "test";
    const t2 = "test1";
    const template = html`${t1} and ${t2}`;
    render(template);
    expect(document.body.innerHTML).to.equal("test and test1");
  });
  
  it("fragments", () => {
    const f1 = document.createDocumentFragment();
    f1.appendChild(document.createTextNode("test"));
    f1.appendChild(document.createTextNode("test1"));
    const template = (frag: DocumentFragment) => html`<div>${frag}</div>`;
    render(template(f1));
    expect(document.body.innerHTML).to.equal("<div>testtest1</div>");
    const f2 = document.createDocumentFragment();
    f2.appendChild(document.createTextNode("test"));
    f2.appendChild(document.createElement("br"));
    f2.appendChild(document.createTextNode("test1"));
    render(template(f2));
    expect(document.body.innerHTML).to.equal("<div>test<br>test1</div>");
  });

  it("should handle dom nodes", () => {
    const node = document.createElement("div");
    node.id = "test";
    const template = html`<div>${node}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div><div id="test"></div></div>`);
  });
  it("directives", () => {
    let lastPart;
    const template = html`<div>${Directive(part => {lastPart = part})}</div>`;
    render(template);
    lastPart.update("test");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test");
    lastPart.update("test123");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test123");
  });
  it("arrays", () => {
    const arr = [1, 2 ,3];
    const template = html`<div>${arr}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal("<div>123</div>");
    arr[0] = 3;
    arr[1] = 2;
    arr[2] = 1;
    render(template);
    expect(document.body.innerHTML).to.equal("<div>321</div>");
  });
  */
});
