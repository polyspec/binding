<?php

declare(strict_types=1);

namespace Polyspec\Sample\E2e;

use PHPUnit\Framework\TestCase;
use Polyspec\Sample\SampleValueError;

use function Polyspec\Sample\size;

/** GN-6at: an open object handle is a cycle; another position after it closed is sharing. */
final class CasesTest extends TestCase
{
    public function testAnObjectCycleIsRefusedAndASharedObjectIsAccepted(): void
    {
        $value = new \stdClass();
        $value->self = $value;
        try {
            size($value);
            self::fail('a cycle was accepted');
        } catch (SampleValueError $error) {
            self::assertSame('unsupported', $error->kind());
            self::assertSame('not data: a container cycle', $error->getMessage());
        }
        unset($value->self);
        $value->item = 1;
        self::assertSame(2, size([$value, $value]));
    }
}
