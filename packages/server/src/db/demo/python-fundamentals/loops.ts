import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const loopsModule: ModuleDef = {
      title: 'Repeating Work with Loops',
      lessons: [
        {
          title: 'for and while',
          description: 'Iterating over ranges and repeating until a condition changes.',
          steps: [
            theory('Loops', 9, t`
# Loops

## for loops

¦for¦ repeats a block once for every item in a sequence. ¦range¦ creates a sequence of integers:

¦¦¦python
for i in range(5):        # 0, 1, 2, 3, 4
    print(i)

for i in range(1, 6):     # 1..5
    print(i)

for i in range(10, 0, -3):  # 10, 7, 4, 1
    print(i)
¦¦¦

¦range(start, stop, step)¦ never includes ¦stop¦.

## while loops

¦while¦ repeats as long as a condition holds:

¦¦¦python
total = 0
n = 1
while n <= 5:
    total += n
    n += 1
print(total)  # 15
¦¦¦

Always make sure something inside the loop moves the condition towards False, or the program will run forever (the exercise runner stops it after a few seconds).

## break and continue

- ¦break¦ leaves the loop immediately.
- ¦continue¦ skips to the next iteration.

## Accumulator pattern

Most loop exercises follow one shape: start a variable before the loop, update it inside, use it after.
`),
            quiz('range semantics', 'single_choice',
              'Which numbers does ¦range(2, 10, 3)¦ produce?'.replaceAll('¦', '`'),
              [['2, 5, 8', true], ['2, 5, 8, 10', false], ['3, 6, 9', false], ['2, 3, 4, 5, 6, 7, 8, 9', false]],
              'It starts at 2 and adds 3 each time (2, 5, 8). The next value, 11, is not below 10, so the sequence stops.'),
            py('Sum of Numbers', 8, {
              statement: 'Read a positive integer N and print the sum of all integers from 1 to N inclusive.',
              input: 'A single integer N.',
              output: 'The sum 1 + 2 + ... + N.',
              constraints: '1 <= N <= 10^6',
              starter: t`
n = int(input())
total = 0
# add every number from 1 to n
`,
              solution: t`
n = int(input())
total = 0
for i in range(1, n + 1):
    total += i
print(total)
`,
              hints: ['range(1, n + 1) includes n.', 'Update total inside the loop and print it after the loop ends.'],
              explanation: 'A classic accumulator loop. (The closed formula n * (n + 1) // 2 gives the same answer.)',
              tests: [
                { stdin: '5', out: '15' },
                { stdin: '100', out: '5050' },
                { stdin: '1', out: '1', hidden: true },
                { stdin: '1000000', out: '500000500000', hidden: true },
              ],
            }),
            py('Multiplication Table', 10, {
              statement: 'Read an integer N and print the first five lines of its multiplication table in the form N x i = result.',
              input: 'A single integer N.',
              output: 'Five lines: N x 1 = ..., up to N x 5 = ...',
              constraints: '-1000 <= N <= 1000',
              starter: t`
n = int(input())
# print five lines
`,
              solution: t`
n = int(input())
for i in range(1, 6):
    print(f"{n} x {i} = {n * i}")
`,
              hints: ['Loop i from 1 to 5.', 'An f-string keeps the format readable.'],
              explanation: 'One print per iteration; the f-string embeds the loop variable and the product.',
              tests: [
                { stdin: '3', out: '3 x 1 = 3\n3 x 2 = 6\n3 x 3 = 9\n3 x 4 = 12\n3 x 5 = 15' },
                { stdin: '-2', out: '-2 x 1 = -2\n-2 x 2 = -4\n-2 x 3 = -6\n-2 x 4 = -8\n-2 x 5 = -10', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Working with Strings',
          description: 'Indexing, slicing, methods and formatting.',
          steps: [
            theory('Strings in Depth', 9, t`
# Strings in Depth

A string is an ordered sequence of characters. You can index it (starting at 0) and slice it:

¦¦¦python
word = "python"
word[0]      # 'p'
word[-1]     # 'n'  (negative counts from the end)
word[1:4]    # 'yth' (start included, stop excluded)
word[::-1]   # 'nohtyp' (reversed)
¦¦¦

Strings are **immutable**: you cannot change a character in place, but you can build a new string.

## Useful methods

¦¦¦python
s = "  Hello World  "
s.strip()          # 'Hello World'
s.lower()          # '  hello world  '
s.split()          # ['Hello', 'World']
"-".join(["a", "b"])  # 'a-b'
s.replace("l", "L")
"lo" in s          # True
len(s)
¦¦¦

## Looping over characters

¦¦¦python
for ch in "abc":
    print(ch)
¦¦¦

## f-strings

¦f"{name} is {age}"¦ embeds expressions directly. Add format specs after a colon: ¦f"{price:.2f}"¦.
`),
            quiz('Slicing', 'single_choice',
              'What is the value of ¦"python"[1:4]¦ ?'.replaceAll('¦', '`'),
              [['yth', true], ['pyth', false], ['ytho', false], ['yt', false]],
              'A slice includes the start index and excludes the stop index: indexes 1, 2 and 3 are y, t and h.'),
            py('Palindrome Check', 10, {
              statement: 'Read a word and print Yes if it reads the same forwards and backwards (ignoring upper/lower case), otherwise No.',
              input: 'A single word.',
              output: 'Yes or No.',
              constraints: '1 <= length <= 100',
              starter: t`
word = input().strip()
`,
              solution: t`
word = input().strip().lower()
print("Yes" if word == word[::-1] else "No")
`,
              hints: ['Convert to lower case first.', 'word[::-1] reverses a string.'],
              explanation: 'Normalise the case, then compare the word with its reverse.',
              tests: [
                { stdin: 'Level', out: 'Yes' },
                { stdin: 'python', out: 'No' },
                { stdin: 'Racecar', out: 'Yes', hidden: true },
                { stdin: 'a', out: 'Yes', hidden: true },
              ],
            }),
            py('Vowel Counter', 10, {
              statement: 'Read a line of text and print how many vowels (a, e, i, o, u, in either case) it contains.',
              input: 'A single line (may be empty or contain spaces).',
              output: 'The vowel count.',
              constraints: 'At most 1000 characters.',
              starter: t`
text = input()
`,
              solution: t`
text = input().lower()
count = 0
for ch in text:
    if ch in "aeiou":
        count += 1
print(count)
`,
              hints: ['Lower-case the text so you only test five letters.', '"x" in "aeiou" is a handy membership test.'],
              explanation: 'Loop through the characters and count those found in the string of vowels.',
              tests: [
                { stdin: 'Hello World', out: '3' },
                { stdin: 'rhythm', out: '0' },
                { stdin: 'AEIOU', out: '5', hidden: true },
              ],
            }),
          ],
        },
      ],
};
