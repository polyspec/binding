// The contract cases of http-cookie run against the installed Node package (V-1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as cookies from '@polyspec/http-cookie';

const cases = JSON.parse(readFileSync(process.env.CASES, 'utf8'));

test('parse', () => {
  assert.ok(cases.parse.length > 0);
  for (const kase of cases.parse) {
    assert.deepEqual(cookies.parseCookie(kase.lines).map((pair) => [...pair]), kase.cookies, kase.id);
  }
});

test('set_cookie', () => {
  assert.ok(cases.set_cookie.length > 0);
  for (const kase of cases.set_cookie) {
    const a = kase.attributes;
    const call = () =>
      cookies.setCookie(kase.name, kase.value, { path: a.path, maxAge: a.max_age, secure: a.secure, httpOnly: a.http_only, sameSite: a.same_site });
    if (kase.raises !== undefined) {
      const category = kase.raises.category[0].toUpperCase() + kase.raises.category.slice(1);
      assert.throws(call, (error) =>
        error.constructor === cookies[`HttpCookie${category}Error`] &&
        error.kind === kase.raises.kind &&
        error.status === kase.raises.status &&
        (kase.raises.message === null || error.message === kase.raises.message), kase.id);
    } else {
      assert.equal(call(), kase.header, kase.id);
    }
  }
});
