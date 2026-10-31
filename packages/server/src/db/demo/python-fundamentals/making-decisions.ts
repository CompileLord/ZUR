import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const makingDecisionsModule: ModuleDef = {
      title: 'Making Decisions',
      lessons: [
        {
          title: 'Booleans and if',
          description: 'Comparisons, truth values and branching.',
          steps: [
            theory('Comparisons and if Statements', 8, t`
# Comparisons and if Statements

A **comparison** produces a ¦bool¦: ¦==¦ (equal), ¦!=¦, ¦<¦, ¦<=¦, ¦>¦, ¦>=¦.

> Do not confuse ¦=¦ (assign) with ¦==¦ (compare).

## Branching

¦¦¦python
temperature = int(input())

if temperature > 30:
    print("Hot")
elif temperature > 15:
    print("Pleasant")
else:
    print("Cold")
¦¦¦

Python uses **indentation** (4 spaces by convention) to mark which lines belong to a branch. The colon at the end of the ¦if¦ line is required. Branches are checked top to bottom and only the first true one runs.

## Truthiness

Any value can be used as a condition. These are *falsy*: ¦0¦, ¦0.0¦, ¦""¦, ¦[]¦, ¦{}¦, ¦None¦, ¦False¦. Nearly everything else is truthy. This gives the idiom:

¦¦¦python
name = input()
if not name:
    print("Please type a name")
¦¦¦
`),
            quiz('Evaluating a condition', 'single_choice',
              'What does this print?\n\n¦¦¦python\nprint(5 > 3 and 2 > 4)\n¦¦¦'.replaceAll('¦', '`'),
              [['False', true], ['True', false], ['5', false], ['4', false]],
              '¦and¦ is true only when both sides are. ¦5 > 3¦ is True but ¦2 > 4¦ is False, so the result is False.'.replaceAll('¦', '`')),
            py('Positive, Negative or Zero', 8, {
              statement: 'Read an integer and print Positive, Negative or Zero.',
              input: 'A single integer.',
              output: 'One of: Positive, Negative, Zero.',
              constraints: '-10^9 <= N <= 10^9',
              starter: t`
n = int(input())
# print Positive, Negative or Zero
`,
              solution: t`
n = int(input())
if n > 0:
    print("Positive")
elif n < 0:
    print("Negative")
else:
    print("Zero")
`,
              hints: ['Use if / elif / else with three branches.', 'Zero is neither greater nor less than zero, so it belongs in else.'],
              explanation: 'Check the two non-zero cases first; whatever remains must be zero.',
              tests: [
                { stdin: '5', out: 'Positive' },
                { stdin: '-2', out: 'Negative' },
                { stdin: '0', out: 'Zero', hidden: true },
              ],
            }),
            py('Leap Year', 10, {
              statement:
                'A year is a leap year if it is divisible by 4, except years divisible by 100 are not leap years unless they are also divisible by 400. Read a year and print Leap or Not leap.',
              input: 'A single positive integer year.',
              output: 'Leap or Not leap.',
              constraints: '1 <= year <= 9999',
              starter: t`
year = int(input())
# Leap or Not leap
`,
              solution: t`
year = int(input())
if year % 400 == 0:
    print("Leap")
elif year % 100 == 0:
    print("Not leap")
elif year % 4 == 0:
    print("Leap")
else:
    print("Not leap")
`,
              hints: ['Test the most specific rule (400) first.', 'The remainder operator % gives 0 when a number divides evenly.'],
              explanation: 'Order matters: 2000 is divisible by 100 but also by 400, so it is a leap year; 1900 is not.',
              tests: [
                { stdin: '2024', out: 'Leap' },
                { stdin: '1900', out: 'Not leap' },
                { stdin: '2000', out: 'Leap', hidden: true },
                { stdin: '2023', out: 'Not leap', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Combining Conditions',
          description: 'and, or, not, and chains of decisions.',
          steps: [
            theory('Logical Operators', 7, t`
# Logical Operators

Combine conditions with:

- ¦and¦: true when both sides are true
- ¦or¦: true when at least one side is true
- ¦not¦: flips a boolean

¦¦¦python
age = 20
has_ticket = True
if age >= 18 and has_ticket:
    print("Enter")
¦¦¦

## Short-circuiting

Python stops evaluating as soon as the answer is known. In ¦x != 0 and 10 / x > 1¦ the division is never attempted when ¦x¦ is zero. Use this to guard risky operations.

## Chained comparisons

Python lets you write ranges naturally:

¦¦¦python
if 0 <= score <= 100:
    print("valid")
¦¦¦

## Conditional expression

For a simple either/or value:

¦¦¦python
label = "even" if n % 2 == 0 else "odd"
¦¦¦

Prefer a normal ¦if¦ statement once the logic is more than one short line.
`),
            quiz('Which are True?', 'multiple_choice',
              'Select all expressions that evaluate to True.',
              [['not False', true], ['1 == 1.0', true], ['"a" < "B"', false], ['3 in [1, 2, 3]', true]],
              'Strings compare by character code: lowercase "a" (97) is greater than uppercase "B" (66), so ¦"a" < "B"¦ is False. ¦1 == 1.0¦ is True because numbers compare by value.'.replaceAll('¦', '`')),
            py('Grade Calculator', 10, {
              statement: 'Convert a score to a letter grade: 90+ A, 80-89 B, 70-79 C, 60-69 D, below 60 F.',
              input: 'An integer score from 0 to 100.',
              output: 'A single letter.',
              constraints: '0 <= score <= 100',
              starter: t`
score = int(input())
# print the letter grade
`,
              solution: t`
score = int(input())
if score >= 90:
    print("A")
elif score >= 80:
    print("B")
elif score >= 70:
    print("C")
elif score >= 60:
    print("D")
else:
    print("F")
`,
              hints: ['Check from the highest threshold downwards so each elif only needs one comparison.'],
              explanation: 'Because branches are tested in order, reaching ¦elif score >= 80¦ already implies the score is below 90.'.replaceAll('¦', '`'),
              tests: [
                { stdin: '95', out: 'A' },
                { stdin: '85', out: 'B' },
                { stdin: '70', out: 'C' },
                { stdin: '60', out: 'D', hidden: true },
                { stdin: '59', out: 'F', hidden: true },
              ],
            }),
          ],
        },
      ],
};
