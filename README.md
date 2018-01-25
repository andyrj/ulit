# ulit
[![npm version](https://badge.fury.io/js/ulit.svg)](https://badge.fury.io/js/ulit)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=andyrj/ulit&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/74420ad6de824a64a06235becc1810c2)](https://www.codacy.com/app/andyrjohnson82/ulit?utm_source=github.com&utm_medium=referral&utm_content=andyrj/ulit&utm_campaign=Badge_Coverage)
[![Build Status](https://travis-ci.org/andyrj/ulit.svg?branch=master)](https://travis-ci.org/andyrj/ulit)

*WIP* Tagged Template Literal html template library.  Inspired by lit-html/hyperHTML.
 - This branch is a rewrite to functional typescript...

TODO:
1. Correct repeat()
2. get test coverage up to 100/100

## Why another tagged template literal library?
"I cannot understand what I cannot build." - Feynman

Started this from a desire to see how hard it would be to improve upon the implementations of lit-html and hyperHTML, focusing on feature density and utilizing the platform, but abandoning support for legacy browsers to use the latest features without transpiling to es5 (instead targeting Chrome, Firefox, Safari, Edge latest versions).

## What was the result?

Rough parity with lit-extended on features and general api setup.

Improvements:
* Transparent svg support - (no need for special svg tag function)
* Simple depth first search walkDOM(fn) avoids using slow TreeWalker api (even if that's only a perf hit in the initial un-cached render()) client side, and will allow for smaller client versions of this library with many methods stripped out which are only required server side in an SSR'd app.
* SSR support via serializable part paths.  This uses followPath(Array<Number|String>), which handles most of the setup work can be pre-rendered down to static html that can be delivered to the client and hydrated.
* By using "{{}}" for attributes and <!--{{}}--> for part placeholders, this library doesn't need to use regex, doesn't force quotes on attributes in templates and can be generally simpler.
* Similar in bundle size to lit-html (probably smaller once the code is split into client/server implementations where server can be tree-shaken/dead code eliminated, from the client bundle).

## How can I use it?
### Install
```
npm install --save ulit
```

#### Simple Example Code
```js
import { html, render, repeat, until } from "ulit";

// will improve quality of example, basically lit-html syntax, but with no need to worry about "on-", $ suffix, or special case svg`` function which we handle transparently to the user, and if a part is a function not set to an attribute starting with "on", we assume it's a directive instead of lit-html directive().
const world = "world";
render(html`<h1>hello ${world}!</h1>`);

// Build your own directive to extend ulit... 
const dummyDirective = value => part => {
  part.update(value);
};
render(html`<h1>${dummyDirective("pass through example...")}</h1>`);

```

## License

ulit is MIT licensed. See [LICENSE](LICENSE.md).
