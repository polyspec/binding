// The contract cases of relay run against the Go packages of relay and json (V-1, B2.87): a json value crosses Carry
// both ways, and the value that comes back is the value that went in, its strings by their UTF-16 code units (RQ-036,
// GN-6x).
package tests

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"

	pjson "github.com/polyspec/json/packages/go"
	relay "github.com/polyspec/relay/packages/go"
)

// given is a case value of the class value of json: its kind and the value of the kind.
type given struct {
	Kind  string          `json:"kind"`
	Value json.RawMessage `json:"value"`
}

type cases struct {
	Carry []struct {
		ID    string `json:"id"`
		Value given  `json:"value"`
	} `json:"carry"`
	CarryDeep []struct {
		ID    string `json:"id"`
		Depth int    `json:"depth"`
	} `json:"carry_deep"`
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

// value makes a case value by the member of the out row of its kind (G-5).
func value(of given) (*pjson.Value, error) {
	switch of.Kind {
	case "null":
		return pjson.ValueNull()
	case "bool":
		var held bool
		if err := json.Unmarshal(of.Value, &held); err != nil {
			return nil, err
		}
		return pjson.ValueBoolean(held)
	case "number", "text":
		var held string
		if err := json.Unmarshal(of.Value, &held); err != nil {
			return nil, err
		}
		if of.Kind == "number" {
			return pjson.ValueNumber(held)
		}
		return pjson.ValueString(held)
	case "text16":
		var held []uint64
		if err := json.Unmarshal(of.Value, &held); err != nil {
			return nil, err
		}
		return pjson.ValueFromUnits(held)
	case "list":
		var held []given
		if err := json.Unmarshal(of.Value, &held); err != nil {
			return nil, err
		}
		items := make([]*pjson.Value, 0, len(held))
		for _, item := range held {
			made, err := value(item)
			if err != nil {
				return nil, err
			}
			items = append(items, made)
		}
		return pjson.ValueArray(items)
	case "map":
		var held [][2]json.RawMessage
		if err := json.Unmarshal(of.Value, &held); err != nil {
			return nil, err
		}
		members, err := pjson.NewOrderedMap()
		if err != nil {
			return nil, err
		}
		for _, pair := range held {
			key, err := keyOf(pair[0])
			if err != nil {
				return nil, err
			}
			var item given
			if err := json.Unmarshal(pair[1], &item); err != nil {
				return nil, err
			}
			made, err := value(item)
			if err != nil {
				return nil, err
			}
			if _, err := members.Insert(key, made); err != nil {
				return nil, err
			}
		}
		return pjson.ValueObject(members)
	}
	return nil, fmt.Errorf("no case value of the kind %s", of.Kind)
}

// keyOf makes a key of a map: a JSON string is a text, any other key is a case value.
func keyOf(raw json.RawMessage) (*pjson.Value, error) {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return pjson.ValueString(text)
	}
	var of given
	if err := json.Unmarshal(raw, &of); err != nil {
		return nil, err
	}
	return value(of)
}

// same fails the test unless the value that Carry gives back has the text of the value that it took.
func same(t *testing.T, id string, took *pjson.Value) {
	t.Helper()
	back, err := relay.Carry(took)
	if err != nil {
		t.Fatalf("%s: %v", id, err)
	}
	want, err := pjson.Stringify(took, pjson.StringifyOptions{})
	if err != nil {
		t.Fatalf("%s: %v", id, err)
	}
	got, err := pjson.Stringify(back, pjson.StringifyOptions{})
	if err != nil {
		t.Fatalf("%s: %v", id, err)
	}
	if got != want {
		t.Errorf("%s: %s, want %s", id, got, want)
	}
}

func TestCarryGivesBackTheValue(t *testing.T) {
	all := load(t)
	if len(all.Carry) == 0 {
		t.Fatal("no case of carry")
	}
	for _, c := range all.Carry {
		took, err := value(c.Value)
		if err != nil {
			t.Fatalf("%s: %v", c.ID, err)
		}
		same(t, c.ID, took)
	}
}

func TestAValueAtTheDepthLimit(t *testing.T) {
	all := load(t)
	if len(all.CarryDeep) == 0 {
		t.Fatal("no case of carry_deep")
	}
	for _, c := range all.CarryDeep {
		took, err := pjson.ValueNull()
		if err != nil {
			t.Fatal(err)
		}
		for level := 0; level < c.Depth; level++ {
			if took, err = pjson.ValueArray([]*pjson.Value{took}); err != nil {
				t.Fatalf("%s: %v", c.ID, err)
			}
		}
		same(t, c.ID, took)
	}
}
