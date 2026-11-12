<?php

declare(strict_types=1);

namespace Polyspec\HttpCookie\E2e;

use PHPUnit\Framework\TestCase;
use Polyspec\HttpCookie as Cookies;

/** The contract cases of http-cookie run with the extension loaded (V-1). */
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

    /** A text of the cases whose characters are U+0000 to U+00FF, as its bytes (latin1). */
    private static function latin1(string $text): string
    {
        return mb_convert_encoding($text, 'ISO-8859-1', 'UTF-8');
    }

    public function testParse(): void
    {
        $group = self::cases()['parse'];
        self::assertNotEmpty($group);
        foreach ($group as $case) {
            $lines = array_map(self::latin1(...), $case['lines']);
            self::assertSame($case['cookies'], Cookies\parseCookie($lines), $case['id']);
        }
    }

    public function testSetCookie(): void
    {
        $group = self::cases()['set_cookie'];
        self::assertNotEmpty($group);
        foreach ($group as $case) {
            $a = $case['attributes'];
            $call = static fn (): string => Cookies\setCookie(
                $case['name'],
                $case['value'],
                path: $a['path'],
                maxAge: $a['max_age'],
                secure: $a['secure'],
                httpOnly: $a['http_only'],
                sameSite: $a['same_site'] === null ? null : Cookies\SameSite::from($a['same_site']),
            );
            if (isset($case['raises'])) {
                $raises = $case['raises'];
                try {
                    $call();
                    self::fail('no error: ' . $case['id']);
                } catch (\Throwable $error) {
                    $class = 'Polyspec\\HttpCookie\\HttpCookie' . ucfirst($raises['category']) . 'Error';
                    self::assertSame($class, $error::class, $case['id']);
                    self::assertSame($raises['kind'], $error->kind(), $case['id']);
                    self::assertSame($raises['status'], $error->status(), $case['id']);
                    if ($raises['message'] !== null) {
                        self::assertSame($raises['message'], $error->getMessage(), $case['id']);
                    }
                }
            } else {
                self::assertSame(self::latin1($case['header']), $call(), $case['id']);
            }
        }
    }
}
