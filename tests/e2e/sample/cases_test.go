// GN-13e: the IEEE 754 transport retains negative zero independently of the generated result comparison.
package tests

import (
	"math"
	"testing"

	sample "github.com/polyspec/sample/packages/go"
)

// B2.497, GN-6af: an instance of ratio, a class with core_type that the Go in row of data names, enters as the float
// of its property, as Node and WASM read it; before, package binding passed it over and it entered as a native.
func TestRatioEntersAsTheFloatOfItsRow(t *testing.T) {
	ratio, err := sample.NewRatio(0.5)
	if err != nil {
		t.Fatal(err)
	}
	value, err := sample.Same(ratio)
	if err != nil {
		t.Fatal(err)
	}
	if got, ok := value.(float64); !ok || got != 0.5 {
		t.Fatalf("GN-6af: an instance of ratio enters as %#v, expected the float 0.5", value)
	}
	items, err := sample.Same([]any{ratio, ratio})
	if err != nil {
		t.Fatal(err)
	}
	if list, ok := items.([]any); !ok || len(list) != 2 || list[0] != 0.5 || list[1] != 0.5 {
		t.Fatalf("GN-6af: a list of one instance of ratio twice enters as %#v", items)
	}
}

func TestFloatTransportKeepsNegativeZeroBits(t *testing.T) {
	negative := math.Copysign(0, -1)
	ratio, err := sample.NewRatio(negative)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ratio.Value()
	if err != nil {
		t.Fatal(err)
	}
	if math.Float64bits(got) != math.Float64bits(negative) {
		t.Fatalf("GN-13e: the transported ratio has bits %016x, expected %016x", math.Float64bits(got), math.Float64bits(negative))
	}
	value, err := sample.Same([]any{negative})
	if err != nil {
		t.Fatal(err)
	}
	items, ok := value.([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("GN-13e: the transported list is %#v", value)
	}
	item, ok := items[0].(float64)
	if !ok || math.Float64bits(item) != math.Float64bits(negative) {
		t.Fatalf("GN-13e: the transported list item is %#v", items[0])
	}
}
