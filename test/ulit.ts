import { expect } from "chai";
import "mocha";
import { directive, Disposable, DomTarget, html, IDisposer, Part, render, Template, PartGenerator, followPath, Optional, PartValue } from "../src/ulit";

describe("Template", () => {
  it("should have {disposer, target, id, element, parts, values}", () => {
    const test1 = new Template(1, document.createElement("template"), [], []);
    expect(test1.disposer !== undefined).to.equal(true);
    expect(test1.target !== undefined).to.equal(true);
    expect(test1.id !== undefined).to.equal(true);
    expect(test1.element !== undefined).to.equal(true);
    expect(test1.parts !== undefined).to.equal(true);
    expect(test1.values !== undefined).to.equal(true);
  });

  it("constructor should correctly set Template.target.{start, end}", () => {
    const templateEl = document.createElement("template");
    templateEl.innerHTML = "<!--{{}}-->1<!--{{}}-->2<!--{{}}-->";
    const generators: PartGenerator[] = [];
    const paths = [[0], [2], [4]];
    paths.forEach(path => {
      generators.push((target: Node) => {
        const partTarget = followPath(target, path);
        return new Part(
          path,
          partTarget as Node,
          false
        );
      });
    });
    const test2 = new Template(0, templateEl, generators, [undefined, undefined, undefined]);
    expect((test2.target.start as any).nodeType).to.equal(undefined);
    expect((test2.target.end as any).nodeType).to.equal(undefined); 
  });
  // TODO: add more tests for Template?
});

describe("Part", () => {
  it("should have {value, path, disposer, target, isSVG}", () => {
    const fragment = document.createDocumentFragment();
    const target = document.createElement("div");
    fragment.appendChild(target);
    const test1 = new Part([0], target);
    expect(test1.value !== undefined).to.equal(true);
    expect(test1.path !== undefined).to.equal(true);
    expect(test1.disposer !== undefined).to.equal(true);
    expect(test1.target !== undefined).to.equal(true);
    expect(test1.isSVG !== undefined).to.equal(true);
  });

  it("update should replace initial comment node", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, false);
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
    const part = new Part([0], comment, false);
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
    const part = new Part([0], comment, false);
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
    const part = new Part([0], comment, false);
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
    const part = new Part([0], comment, false);
    part.update();
    expect(fragment.firstChild.nodeType).to.equal(8);
    let directivePart;
    const testDirective = directive((p) => { directivePart = p; });
    part.update(testDirective);
    expect(fragment.firstChild.nodeType).to.equal(8);
    directivePart.update("test");
    expect(fragment.firstChild.nodeType).to.equal(3);
  });

  it("update should correctly handle promises", done => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, false);
    part.update();
    expect(fragment.firstChild.nodeType).to.equal(8);
    part.update(new Promise((resolve, reject) => {
      resolve("test");
      done();
    }));
    expect(fragment.firstChild.nodeType).to.equal(8);
    expect(fragment.firstChild.nodeValue).to.equal("test");
    setTimeout(expect(fragment.firstChild.nodeType).to.equal(3), 600);
  });

  it("update should correctly handle attributes", done => {
    const fragment = document.createDocumentFragment();
    const div = document.createElement("div");
    fragment.appendChild(div);
    const part = new Part([0, "id"], div, false);
    expect((fragment.firstChild as HTMLElement).id).to.equal("");
    part.update();
    expect((fragment.firstChild as HTMLElement).id).to.equal("");
    part.update("test");
    expect((fragment.firstChild as HTMLElement).id).to.equal("test");
    part.update(new Promise(resolve => {
      resolve("async");
    }));
    setTimeout(() => {
      expect((fragment.firstChild as HTMLElement).id).to.equal("async");
      done();
    }, 500);
  });
  
  it("should correctly handle iterables/arrays", () => {
    const fragment = document.createDocumentFragment();
    const comment = document.createComment("{{}}");
    fragment.appendChild(comment);
    const part = new Part([0], comment, false);
    expect(fragment.firstChild.nodeType === 8).to.equal(true);
    const iter = new Set<string>();
    iter.add("A");
    iter.add("B");
    part.update(iter);
    expect(fragment.childNodes[0].nodeValue).to.equal("A");
    expect(fragment.childNodes[1].nodeValue).to.equal("B");
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
    t1.start = new Part([0], partNode, false);
    t1.end = new Part([1], partNode, false);
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

describe("render", () => {
  it("should handle static templates", () => {
    const test1 = html`<div id="test">test</div>`;
    render(test1);
    expect(document.body.innerHTML).to.equal(`<div id="test">test</div>`);
  });
  it("should handle single node templates", () => {
    const str = "test2";
    const test3 = val => html`${val}`;
    render(test3(str));
    expect(document.body.innerHTML).to.equal(`${str}`);
  });
  it("expression can change part types between renders", () => {
    const str = "test3";
    const div = document.createElement("div");
    div.id = str;
    const test2 = val => html`${val}`;
    render(test2(str));
    expect(document.body.innerHTML).to.equal(str);
    render(test2(div));
    expect(document.body.innerHTML).to.equal(`<div id="${str}"></div>`);
  });
  it("should handle defaultTemplateFn", () => {
    const test4 = "test2";
    const div = document.createElement("div");
    render(test4);
    expect(document.body.innerHTML).to.equal(test4);
    render(html`${div}`);
    expect(document.body.firstChild).to.equal(div);
  });
  it("templates should be able to start and end with parts", () => {
    const t1 = "test";
    const t2 = "test1";
    const template = html`${t1} and ${t2}`;
    render(template);
    expect(document.body.innerHTML).to.equal("test and test1");
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
  it("nested templates should update in place", () => {
    const nested = (str: string) => html`<div class=nested>${str}</div>`;
    const template = (str: string) => html`<div>${nested(str)}</div>`;
    render(template("test"));
    expect(document.body.innerHTML).to.equal(`<div><div class="nested">test</div></div>`);
    render(template("123"));
    expect((document.body.firstChild as any).firstChild.firstChild.nodeValue).to.equal("123");
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
    const template = html`<div>${directive(part => {lastPart = part})}</div>`;
    render(template);
    lastPart.update("test");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test");
    lastPart.update("test123");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test123");
  });
  it("setting event handler should work", () => {
    let count = 0;
    const handler = (e: Event) => count++;
    const template = html`<div onclick=${handler}>test</div>`;
    render(template);
    const event = document.createEvent("mouseevent");
    event.initEvent("click", false, true);
    document.body.firstChild.dispatchEvent(event);
    expect(count).to.equal(1);
  });
  it("should handle attribute parts", () => {
    const str = "test3";
    const test3 = (val?: PartValue) => html`<div id=${val}></div>`;
    render(test3());
    expect(document.body.innerHTML).to.equal(`<div></div>`);
    render(test3(undefined));
    expect(document.body.innerHTML).to.equal(`<div></div>`);
    render(test3(str));
    expect(document.body.innerHTML).to.equal(`<div id="${str}"></div>`);  
    render(test3(undefined));
    expect(document.body.innerHTML).to.equal(`<div></div>`);
  });
  it("attribute directives should work as expected", () => {
    const template = (str: string) => html`<div id=${directive(part => part.update(str))}>test</div>`;
    render(template("test"));
    expect((document.body.firstChild as any).id).to.equal("test");
    render(template("test1"));
    expect((document.body.firstChild as any).id).to.equal("test1");
  });
  it("arrays", () => {
    const arr = [1, 2 ,3];
    render(arr);
    expect(document.body.innerHTML).to.equal("123");
    arr[0] = 3;
    arr[1] = 2;
    arr[2] = 1;
    render(arr);
    expect(document.body.innerHTML).to.equal("321");
  });

  // TODO: jsdom appears to have a bug and it's a fugly code base, lets just extend undom to have DocumentFragment and HTMLTemplateElement
  // it("svg parts", () => {
  //   const template = (num: number) => html`<svg><g><line x1=${num} y1=0 x2=0 y2=0 /></g></svg>`;
  //   const escaped = (num: number) => html`<svg><foreignObject>${num.toString()}</foreignObject></svg>`;
  //   render(template(1));
  //   const line = document.body.firstChild.firstChild.firstChild as Node;
  //   expect(line.nodeName).to.equal("line");
  //   console.log("line");
  //   expect((line as SVGLineElement).getAttributeNS(`http://www.w3.org/2000/svg`, "x1")).to.equal("1");
  //   expect(document.body.innerHTML).to.equal(`<svg><g><line y1="0" x2="0" y2="0" x1="1"></line></g></svg>`);
  //   render(escaped(2));
  //   expect(document.body.innerHTML).to.equal(`<svg><foreignObject>2</foreignObject></svg>`);
  // });
});

/*
describe("html", () => {
  it("should")
});
*/