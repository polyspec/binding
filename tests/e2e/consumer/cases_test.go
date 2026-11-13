// The contract cases of the consumer sample run against the Go package of consumer (V-1): the value alias of another
// repository crosses the functions and the callback both ways (T-3, U-7 (a')).
package tests

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
	"unicode/utf8"

	consumer "github.com/polyspec/consumer/packages/go"
	liberrors "github.com/polyspec/consumer/packages/go/errors"
)

// given is a case value of data: its kind and the value of the kind.
type given struct {
	Kind  string          `json:"kind"`
	Value json.RawMessage `json:"value"`
}

type cases struct {
	Measure []struct {
		ID     string `json:"id"`
		Value  given  `json:"value"`
		Result uint64 `json:"result"`
	} `json:"measure"`
	Pair []struct {
		ID     string `json:"id"`
		Value  given  `json:"value"`
		Result given  `json:"result"`
	} `json:"pair"`
	Fetch []struct {
		ID     string `json:"id"`
		Key    string `json:"key"`
		Raises struct {
			Kind    string `json:"kind"`
			Message string `json:"message"`
		} `json:"raises"`
	} `json:"fetch"`
}

func load(t *testing.T) cases {
	t.Helper()
	data, err := os.ReadFile(os.Getenv("CASES"))
	if err != nil {
		t.Fatal(err)
	}
	var all cases
	if err := json.Unmarshal(data, &all); err != nil {
		t.Fatal(err)
	}
	return all
}

// value makes a case value of data as the Go value that the alias takes and gives (GN-13).
func value(t *testing.T, of given) any {
	t.Helper()
	switch of.Kind {
	case "null":
		return nil
	case "list":
		var held []given
		if err := json.Unmarshal(of.Value, &held); err != nil {
			t.Fatal(err)
		}
		items := make([]any, 0, len(held))
		for _, item := range held {
			items = append(items, value(t, item))
		}
		return items
	case "map":
		var held [][2]json.RawMessage
		if err := json.Unmarshal(of.Value, &held); err != nil {
			t.Fatal(err)
		}
		entries := map[string]any{}
		for _, pair := range held {
			var key string
			if err := json.Unmarshal(pair[0], &key); err != nil {
				t.Fatal(err)
			}
			var item given
			if err := json.Unmarshal(pair[1], &item); err != nil {
				t.Fatal(err)
			}
			entries[key] = value(t, item)
		}
		return entries
	}
	var held any
	if err := json.Unmarshal(of.Value, &held); err != nil {
		t.Fatal(err)
	}
	return held
}

// holder is a holder of data by key, as Go code implements it.
type holder struct {
	held map[string]any
}

func (h holder) Get(key string) (*any, error) {
	item, ok := h.held[key]
	if !ok {
		return nil, nil
	}
	return &item, nil
}

func (h holder) Set(key string, item any) error {
	h.held[key] = item
	return nil
}

func TestMeasureAndPair(t *testing.T) {
	all := load(t)
	if len(all.Measure) == 0 || len(all.Pair) == 0 {
		t.Fatal("no case of measure or of pair")
	}
	for _, c := range all.Measure {
		got, err := consumer.Measure(value(t, c.Value))
		if err != nil || got != c.Result {
			t.Errorf("%s: %d, %v, want %d", c.ID, got, err, c.Result)
		}
	}
	for _, c := range all.Pair {
		got, err := consumer.Pair(value(t, c.Value))
		if want := value(t, c.Result); err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %#v, %v, want %#v", c.ID, got, err, want)
		}
	}
}

func TestTheHolderGivesAndTakesData(t *testing.T) {
	held := map[string]any{"a": map[string]any{"k": []any{1.5, "x", nil, true}}}
	got, err := consumer.Fetch(holder{held}, "a")
	if err != nil || !reflect.DeepEqual(got, held["a"]) {
		t.Fatalf("fetch: %#v, %v", got, err)
	}
	copied, err := consumer.Copy(holder{held}, "a", "b")
	if err != nil || !copied || !reflect.DeepEqual(held["b"], held["a"]) {
		t.Fatalf("copy: %v, %v, %#v", copied, err, held["b"])
	}
	copied, err = consumer.Copy(holder{held}, "c", "d")
	if _, has := held["d"]; err != nil || copied || has {
		t.Fatalf("copy of a key without data: %v, %v, %#v", copied, err, held["d"])
	}
}

func TestFetchRaisesItsCases(t *testing.T) {
	all := load(t)
	if len(all.Fetch) == 0 {
		t.Fatal("no case of fetch")
	}
	for _, c := range all.Fetch {
		_, err := consumer.Fetch(holder{map[string]any{}}, c.Key)
		// E-2, I-3: the kind has the type of its error unit, whose properties the core error gives.
		failure, ok := err.(*liberrors.AbsentError)
		if !ok {
			t.Fatalf("%s: %#v is no AbsentError", c.ID, err)
		}
		var category *liberrors.ConsumerValueError
		if !errors.As(err, &category) {
			t.Errorf("%s: %#v is no error of its category", c.ID, err)
		}
		if failure.Kind() != c.Raises.Kind || failure.Error() != c.Raises.Message || failure.Key() != c.Key {
			t.Errorf("%s: kind %s, message %s, key %s", c.ID, failure.Kind(), failure.Error(), failure.Key())
		}
		if length := failure.Length(); length == nil || *length != uint64(utf8.RuneCountInString(c.Key)) {
			t.Errorf("%s: the length %v", c.ID, length)
		}
	}
	_, err := consumer.Fetch(holder{map[string]any{}}, "")
	failure, ok := err.(*liberrors.AbsentError)
	if !ok || failure.Key() != "" || failure.Length() != nil {
		t.Fatalf("an empty key: %#v", err)
	}
}

// A value that the owner of the alias refuses is its kind in the type of this library.
func TestRefusedByTheOwner(t *testing.T) {
	// The owner refuses a map with a key that is no text and a string whose bytes are no text; a func is data of the
	// owner, which keeps it as a Native (GN-6u).
	for name, refused := range map[string]any{"a key that is no text": map[int]string{5: "x"}, "bytes that are no text": "\xff"} {
		calls := []func() error{
			func() error { _, err := consumer.Measure(refused); return err },
			func() error { _, err := consumer.Pair([]any{refused}); return err },
			func() error { _, err := consumer.Fetch(holder{map[string]any{"a": refused}}, "a"); return err },
		}
		for index, call := range calls {
			err := call()
			failure, ok := err.(*liberrors.ConsumerValueError)
			if !ok || failure.Kind() != "unsupported" {
				t.Errorf("%s, call %d: %#v", name, index, err)
				continue
			}
			if _, has := failure.Status(); has {
				t.Errorf("%s, call %d: the status of %#v", name, index, err)
			}
		}
	}
}
