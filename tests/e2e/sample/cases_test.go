// GN-13e: the IEEE 754 transport retains negative zero independently of the generated result comparison.
package tests

import (
	"math"
	"testing"

	sample "github.com/polyspec/sample/packages/go"
)

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
