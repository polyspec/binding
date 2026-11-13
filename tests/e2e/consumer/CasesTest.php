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
     * A case value of data as the PHP value that the alias takes and gives (GN-13).
     *
     * @param array<string, mixed> $given
     */
    private static function value(array $given): mixed
    {
        return match ($given['kind']) {
            'null' => null,
            'list' => array_map(self::value(...), $given['value']),
            'map' => array_combine(array_column($given['value'], 0), array_map(self::value(...), array_column($given['value'], 1))),
            default => $given['value'],
        };
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
            self::assertSame(self::value($case['result']), Consumer\pair(self::value($case['value'])), $case['id']);
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
        // A map with a key that is no text is not data. The value is one that the extension does not keep: a value that
        // enters as a handle, such as a Closure, stays in the extension for the life of the thread (GN-6e).
        $refused = [5 => 'x'];
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
