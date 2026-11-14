<?php

declare(strict_types=1);

namespace Polyspec\Consumer\E2e;

use PHPUnit\Framework\TestCase;
use Polyspec\Consumer as Consumer;

/** A holder of data by key, as PHP code implements it. */
final class Held implements Consumer\Holder
{
    /** @param array<string, mixed> $held */
    public function __construct(public array $held)
    {
    }

    public function get(mixed $key): mixed
    {
        return $this->held[$key] ?? null;
    }

    public function set(mixed $key, mixed $value): mixed
    {
        $this->held[$key] = $value;
        return null;
    }
}

/**
 * The contract cases of the consumer sample run with the extensions loaded (V-1): the value alias of another
 * repository crosses the functions and the callback both ways (T-3, U-7 (a')).
 */
final class CasesTest extends TestCase
{
    /** @return array<string, list<array<string, mixed>>> */
    private static function cases(): array
    {
        $path = getenv('CASES');
        self::assertIsString($path);
        $cases = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($cases);
        return $cases;
    }

    /**
     * A case value of data as the PHP value that the alias takes and gives (GN-13). A reference is a place of an
     * array, which takes the variable of its id by reference, so every place of an id shares one reference; the
     * variables end with this call, so a reference that one place holds is its value, as PHP keeps it (GN-13e).
     *
     * @param array<string, mixed> $given
     */
    private static function value(array $given): mixed
    {
        $ids = [];
        return self::made($given, $ids);
    }

    /**
     * @param array<string, mixed> $given
     * @param array<int, mixed> $ids
     */
    private static function made(array $given, array &$ids): mixed
    {
        $out = [];
        switch ($given['kind']) {
            case 'null':
                return null;
            case 'list':
                foreach ($given['value'] as $index => $item) {
                    self::put($out, $index, $item, $ids);
                }
                return $out;
            case 'map':
                foreach ($given['value'] as [$key, $item]) {
                    self::put($out, $key, $item, $ids);
                }
                return $out;
            case 'reference':
                return self::made($given['value']['value'], $ids);
            default:
                return $given['value'];
        }
    }

    /**
     * The place of an array under its key: a value, or the reference of the id of a node of kind reference.
     *
     * @param array<int|string, mixed> $into
     * @param array<string, mixed> $given
     * @param array<int, mixed> $ids
     */
    private static function put(array &$into, int|string $key, array $given, array &$ids): void
    {
        if ($given['kind'] !== 'reference') {
            $into[$key] = self::made($given, $ids);
            return;
        }
        $id = $given['value']['id'];
        if (!array_key_exists('value', $given['value'])) {
            $into[$key] = &$ids[$id];
            return;
        }
        $ids[$id] = null;
        $into[$key] = &$ids[$id];
        $ids[$id] = self::made($given['value']['value'], $ids);
    }

    /**
     * The places of a value in pre-order, as the generated tests compare them (GN-13e): a reference is numbered by its
     * first place and named by that number at a later place, so the identity of each place is compared.
     *
     * @param array<string, int> $seen
     */
    private static function shape(mixed $held, array &$seen = []): mixed
    {
        if (!is_array($held)) {
            return $held;
        }
        $out = [];
        foreach (array_keys($held) as $key) {
            $reference = \ReflectionReference::fromArrayElement($held, $key);
            if ($reference === null) {
                $out[$key] = self::shape($held[$key], $seen);
                continue;
            }
            $id = $reference->getId();
            if (array_key_exists($id, $seen)) {
                $out[$key] = ['again', $seen[$id]];
                continue;
            }
            $seen[$id] = count($seen);
            $out[$key] = ['reference', $seen[$id], self::shape($held[$key], $seen)];
        }
        return $out;
    }

    public function testMeasureAndPair(): void
    {
        $cases = self::cases();
        self::assertNotEmpty($cases['measure']);
        self::assertNotEmpty($cases['pair']);
        foreach ($cases['measure'] as $case) {
            self::assertSame($case['result'], Consumer\measure(self::value($case['value'])), $case['id']);
        }
        foreach ($cases['pair'] as $case) {
            self::assertSame(self::shape(self::value($case['result'])), self::shape(Consumer\pair(self::value($case['value']))), $case['id']);
        }
    }

    public function testHolder(): void
    {
        $holder = new Held(['a' => ['k' => [1.5, 'x', null, true]]]);
        self::assertSame($holder->held['a'], Consumer\fetch($holder, 'a'));
        self::assertTrue(Consumer\copy($holder, 'a', 'b'));
        self::assertSame($holder->held['a'], $holder->held['b']);
        self::assertFalse(Consumer\copy($holder, 'c', 'd'));
        self::assertArrayNotHasKey('d', $holder->held);
    }

    public function testFetchRaises(): void
    {
        $group = self::cases()['fetch'];
        self::assertNotEmpty($group);
        foreach ($group as $case) {
            try {
                Consumer\fetch(new Held([]), $case['key']);
                self::fail('no error: ' . $case['id']);
            } catch (Consumer\ConsumerValueError $error) {
                // E-2, I-3: the kind has the class of its error unit, whose properties the core error gives.
                self::assertSame(Consumer\AbsentError::class, $error::class, $case['id']);
                self::assertSame($case['raises']['kind'], $error->kind(), $case['id']);
                self::assertNull($error->status(), $case['id']);
                self::assertSame($case['raises']['message'], $error->getMessage(), $case['id']);
                self::assertSame($case['key'], $error->key(), $case['id']);
                self::assertSame(strlen($case['key']), $error->length(), $case['id']);
            }
        }
        try {
            Consumer\fetch(new Held([]), '');
            self::fail('no error');
        } catch (Consumer\AbsentError $error) {
            self::assertSame('', $error->key());
            self::assertNull($error->length());
        }
    }

    /** A value that the owner of the alias refuses is its kind in the class of this library. */
    public function testRefusedByTheOwner(): void
    {
        // The owner refuses a map with a key that is no text and a string whose bytes are no text; a Closure is data of
        // the owner, which keeps it as a Native (GN-6u).
        foreach ([[5 => 'x'], "\xff"] as $refused) {
            $calls = [
                static fn (): mixed => Consumer\measure($refused),
                static fn (): mixed => Consumer\pair([$refused]),
                static fn (): mixed => Consumer\fetch(new Held(['a' => $refused]), 'a'),
            ];
            foreach ($calls as $index => $call) {
                try {
                    $call();
                    self::fail("no error: {$index}");
                } catch (Consumer\ConsumerValueError $error) {
                    self::assertSame(Consumer\ConsumerValueError::class, $error::class);
                    self::assertSame('unsupported', $error->kind());
                    self::assertNull($error->status());
                }
            }
        }
    }
}
