<?php

declare(strict_types=1);

namespace Polyspec\Classes\E2e;

use PHPUnit\Framework\TestCase;
use Polyspec\Classes as Classes;
use Polyspec\Classes\Tag;

/**
 * The contract cases of the classes repository run with the extension loaded (V-1): a class unit with a static
 * member, methods that take arguments and the class, and the hooks of N-4 (T-5, U-2).
 */
final class CasesTest extends TestCase
{
    /** @return array<string, list<array<string, mixed>>> */
    private static function cases(): array
    {
        $path = getenv('CASES');
        self::assertIsString($path);
        $text = file_get_contents($path);
        self::assertIsString($text);
        return json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    }

    public function testTheCasesOfTheMembersThatGiveAValue(): void
    {
        $cases = self::cases();
        self::assertNotEmpty($cases['tag_name']);
        self::assertNotEmpty($cases['tag_to_string']);
        self::assertNotEmpty($cases['tag_repeat']);
        foreach ($cases['tag_name'] as $case) {
            self::assertSame($case['result'], (new Tag($case['name']))->name(), $case['id']);
        }
        foreach ($cases['tag_to_string'] as $case) {
            self::assertSame($case['result'], (string) new Tag($case['name']), $case['id']);
        }
        foreach ($cases['tag_repeat'] as $case) {
            $names = array_map(static fn (Tag $tag): string => $tag->name(), (new Tag($case['name']))->repeat($case['count']));
            self::assertSame(array_fill(0, $case['count'], $case['name']), $names, $case['id']);
        }
        foreach ($cases['tag_parse'] as $case) {
            if (!array_key_exists('raises', $case)) {
                self::assertSame($case['text'], Tag::parse($case['text'])->name(), $case['id']);
            }
        }
    }

    public function testAClassCrossesBothWays(): void
    {
        $a = new Tag('a');
        $loud = Classes\shout($a);
        self::assertInstanceOf(Tag::class, $loud);
        self::assertSame('A', $loud->name());
        self::assertSame('a,A', Classes\join([$a, $loud]));
        $entries = [];
        foreach ($a as $key => $value) {
            $entries[$key] = $value->name();
        }
        self::assertSame(['a' => 'a'], $entries);
        self::assertSame('bc', Tag::parse('b')->withSuffix('c')->name());
        self::assertTrue($a->same(new Tag('a')));
        self::assertFalse($a->same($loud));
        self::assertContainsOnlyInstancesOf(Tag::class, $a->repeat(3));
    }

    public function testAValueThatIsNoInstanceIsKindInvalidArgumentType(): void
    {
        foreach ([null, 1, 'a', [], ['name' => 'a'], new \stdClass()] as $index => $bad) {
            $calls = [
                static fn (): mixed => Classes\shout($bad),
                static fn (): mixed => Classes\join([$bad]),
                static fn (): mixed => (new Tag('a'))->same($bad),
            ];
            foreach ($calls as $call) {
                try {
                    $call();
                    self::fail("no error: {$index}");
                } catch (Classes\ClassesTypeError $error) {
                    self::assertSame('invalid_argument_type', $error->kind());
                }
            }
        }
    }

    public function testAStaticMemberAndAMethodGiveTheKindOfTheCore(): void
    {
        $calls = [
            'missing' => [static fn (): mixed => Tag::parse(''), static fn (): mixed => (new Tag('a'))->withSuffix('')],
            'unsupported' => [static fn (): mixed => json_encode(new Tag('a'), JSON_THROW_ON_ERROR)],
        ];
        foreach ($calls as $kind => $group) {
            foreach ($group as $call) {
                try {
                    $call();
                    self::fail("no error: {$kind}");
                } catch (Classes\ClassesValueError $error) {
                    self::assertSame(Classes\ClassesValueError::class, $error::class);
                    self::assertSame($kind, $error->kind());
                }
            }
        }
    }
}
