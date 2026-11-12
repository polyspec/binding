// The contract cases of http-cookie run against the Go package (V-1). A latin1 text of a case is a Go string of one
// byte per character (B-8).
package tests

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"

	httpcookie "github.com/polyspec/http-cookie/packages/go"
	liberrors "github.com/polyspec/http-cookie/packages/go/errors"
)

type raises struct {
	Kind     string  `json:"kind"`
	Status   *int    `json:"status"`
	Category string  `json:"category"`
	Message  *string `json:"message"`
}

type cases struct {
	Parse []struct {
		ID      string     `json:"id"`
		Lines   []string   `json:"lines"`
		Cookies [][]string `json:"cookies"`
	} `json:"parse"`
	SetCookie []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Value      string `json:"value"`
		Attributes struct {
			Path     string  `json:"path"`
			MaxAge   *uint64 `json:"max_age"`
			Secure   bool    `json:"secure"`
			HTTPOnly bool    `json:"http_only"`
			SameSite *string `json:"same_site"`
		} `json:"attributes"`
		Header *string `json:"header"`
		Raises *raises `json:"raises"`
	} `json:"set_cookie"`
}

func load(t *testing.T) cases {
	t.Helper()
	text, err := os.ReadFile(os.Getenv("CASES"))
	if err != nil {
		t.Fatal(err)
	}
	var all cases
	if err := json.Unmarshal(text, &all); err != nil {
		t.Fatal(err)
	}
	return all
}

// latin1 is the bytes of a text whose characters are U+0000 to U+00FF, one byte each.
func latin1(text string) string {
	var out strings.Builder
	for _, r := range text {
		out.WriteByte(byte(r))
	}
	return out.String()
}

// The error type of each category (E-7), with its kind and status.
type failure interface {
	error
	Kind() string
	Status() (int, bool)
}

func category(err error) string {
	var value *liberrors.HTTPCookieValueError
	var typ *liberrors.HTTPCookieTypeError
	var io *liberrors.HTTPCookieIoError
	var store *liberrors.HTTPCookieStoreError
	var busy *liberrors.HTTPCookieBusyError
	var internal *liberrors.HTTPCookieInternalError
	switch {
	case errors.As(err, &value):
		return "value"
	case errors.As(err, &typ):
		return "type"
	case errors.As(err, &io):
		return "io"
	case errors.As(err, &store):
		return "store"
	case errors.As(err, &busy):
		return "busy"
	case errors.As(err, &internal):
		return "internal"
	}
	return ""
}

func TestParse(t *testing.T) {
	group := load(t).Parse
	if len(group) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range group {
		lines := make([]string, len(c.Lines))
		for i, line := range c.Lines {
			lines[i] = latin1(line)
		}
		got, err := httpcookie.ParseCookie(lines)
		if err != nil {
			t.Fatalf("%s: %v", c.ID, err)
		}
		want := make([][2]string, len(c.Cookies))
		for i, pair := range c.Cookies {
			want[i] = [2]string{pair[0], pair[1]}
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: got %q, want %q", c.ID, got, want)
		}
	}
}

func TestSetCookie(t *testing.T) {
	group := load(t).SetCookie
	if len(group) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range group {
		a := c.Attributes
		attributes := httpcookie.Attributes{Path: a.Path, MaxAge: a.MaxAge, Secure: a.Secure, HttpOnly: a.HTTPOnly}
		if a.SameSite != nil {
			sameSite := httpcookie.SameSite(*a.SameSite)
			attributes.SameSite = &sameSite
		}
		header, err := httpcookie.SetCookie(c.Name, c.Value, attributes)
		if c.Raises != nil {
			var f failure
			if !errors.As(err, &f) || category(err) != c.Raises.Category || f.Kind() != c.Raises.Kind {
				t.Errorf("%s: got %v, want kind %s", c.ID, err, c.Raises.Kind)
				continue
			}
			status, ok := f.Status()
			if (c.Raises.Status == nil) == ok || (ok && status != *c.Raises.Status) {
				t.Errorf("%s: status %d %v", c.ID, status, ok)
			}
			if c.Raises.Message != nil && f.Error() != *c.Raises.Message {
				t.Errorf("%s: message %q", c.ID, f.Error())
			}
			continue
		}
		if err != nil || c.Header == nil || header != latin1(*c.Header) {
			t.Errorf("%s: got %q, %v", c.ID, header, err)
		}
	}
}
