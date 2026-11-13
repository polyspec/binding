// The contract cases of the classes repository run against the Go package of classes (V-1): the members that wait
// (GN-6m, GN-6q), called from two goroutines on one object. Every order is an order of events of the test: a channel
// that a callback closes, and a channel that carries a result.
package tests

import (
	"encoding/json"
	"os"
	"testing"

	classes "github.com/polyspec/classes/packages/go"
)

type cases struct {
	GateEnterSlowly []struct {
		ID     string  `json:"id"`
		Result *string `json:"result"`
	} `json:"gate_enter_slowly"`
	UsherSeat []struct {
		ID     string  `json:"id"`
		Result *string `json:"result"`
	} `json:"usher_seat"`
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

// outcome is what a call of a member that gives a text returned.
type outcome struct {
	text string
	err  error
}

// held is a guide that tells that the core called it and then waits until the test lets it answer.
type held struct {
	entered chan<- struct{}
	leave   <-chan struct{}
	guest   string
}

func (g held) Lead(string) (string, error) {
	close(g.entered)
	<-g.leave
	return g.guest, nil
}

// prompt is a guide that answers at once.
type prompt string

func (g prompt) Lead(string) (string, error) { return string(g), nil }

// GN-6m, GN-6h: a call that waits holds the read lock of its receiver on the thread of its goroutine, so a second
// goroutine calls the same object while the first call is inside the core, and both results arrive.
func TestTwoGoroutinesWaitInOneUsher(t *testing.T) {
	if len(load(t).UsherSeat) == 0 {
		t.Fatal("no cases")
	}
	usher, err := classes.NewUsher("a")
	if err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{})
	leave := make(chan struct{})
	first := make(chan outcome, 1)
	go func() {
		text, err := usher.Seat(held{entered: entered, leave: leave, guest: "first"})
		first <- outcome{text, err}
	}()
	// The first call is inside the core, which called its guide, and stays there until leave is closed.
	<-entered
	second, err := usher.Seat(prompt("second"))
	if err != nil || second != "a seats second" {
		t.Fatalf("the call beside a waiting call: %q, %v", second, err)
	}
	name, err := usher.Name()
	if err != nil || name != "a" {
		t.Fatalf("a read beside a waiting call: %q, %v", name, err)
	}
	close(leave)
	if got := <-first; got.err != nil || got.text != "a seats first" {
		t.Fatalf("the waiting call: %q, %v", got.text, got.err)
	}
}

// GN-6m: two goroutines call a member that waits of one gate, and each gets the result of the case.
func TestTwoGoroutinesEnterOneGateSlowly(t *testing.T) {
	var want string
	for _, c := range load(t).GateEnterSlowly {
		if c.Result != nil {
			want = *c.Result
		}
	}
	if want == "" {
		t.Fatal("no case with a result")
	}
	tag, err := classes.NewTag("a")
	if err != nil {
		t.Fatal(err)
	}
	gate, err := tag.Gate()
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan outcome, 2)
	for range 2 {
		go func() {
			text, err := gate.EnterSlowly()
			results <- outcome{text, err}
		}()
	}
	for range 2 {
		if got := <-results; got.err != nil || got.text != want {
			t.Fatalf("a call of two: %q, %v, want %q", got.text, got.err, want)
		}
	}
}
