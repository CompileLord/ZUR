import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const functionsAndCollectionsModule: ModuleDef = {
      title: 'Functions and Collections',
      lessons: [
        {
          title: 'Defining Functions',
          description: 'Parameters, return values and decomposing problems.',
          steps: [
            theory('Functions', 9, t`
# Functions

A function packages code under a name so you can reuse it.

¦¦¦python
def area(width, height):
    return width * height

print(area(3, 4))   # 12
¦¦¦

- ¦def¦ introduces the function; the indented block is its body.
- **Parameters** (¦width¦, ¦height¦) are names for the values passed in.
- ¦return¦ hands a result back and ends the function. A function that never returns gives back ¦None¦.

## Default and keyword arguments

¦¦¦python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

greet("Ada")                    # Hello, Ada!
greet("Ada", greeting="Hi")     # Hi, Ada!
¦¦¦

## Scope

Variables created inside a function are *local*; they disappear when it ends. Prefer passing values in and returning results over changing global variables.

## Why bother?

Small named functions are easier to test, name, reuse and reason about. When a solution gets longer than about 15 lines, look for a piece you can name and extract.
`),
            quiz('Return values', 'single_choice',
              'A function body finishes without ever executing a ¦return¦ statement. What does the call evaluate to?'.replaceAll('¦', '`'),
              [['None', true], ['0', false], ['An empty string', false], ['It raises an error', false]],
              'Python functions always return something; without an explicit return the value is ¦None¦.'.replaceAll('¦', '`')),
            py('Factorial Function', 10, {
              statement: 'Write a function factorial(n) and use it to print n! for the input n. By definition 0! = 1.',
              input: 'A single integer n.',
              output: 'n factorial.',
              constraints: '0 <= n <= 20',
              starter: t`
def factorial(n):
    # return n * (n-1) * ... * 1
    pass

n = int(input())
print(factorial(n))
`,
              solution: t`
def factorial(n):
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

n = int(input())
print(factorial(n))
`,
              hints: ['Start result at 1 so that 0! works without a special case.', 'range(2, n + 1) is empty when n is 0 or 1.'],
              explanation: 'Multiply 2 through n into an accumulator that starts at 1.',
              tests: [
                { stdin: '5', out: '120' },
                { stdin: '0', out: '1' },
                { stdin: '10', out: '3628800', hidden: true },
                { stdin: '20', out: '2432902008176640000', hidden: true },
              ],
            }),
            py('Prime Checker', 12, {
              statement: 'Write a function is_prime(n) and print Prime or Not prime for the input. Numbers below 2 are not prime.',
              input: 'A single integer n.',
              output: 'Prime or Not prime.',
              constraints: '0 <= n <= 10^6',
              starter: t`
def is_prime(n):
    pass

n = int(input())
print("Prime" if is_prime(n) else "Not prime")
`,
              solution: t`
def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True

n = int(input())
print("Prime" if is_prime(n) else "Not prime")
`,
              hints: ['Handle n < 2 first.', 'You only need to test divisors up to the square root of n.'],
              explanation: 'If n has a divisor, it has one no larger than sqrt(n), so the loop condition d * d <= n is enough.',
              tests: [
                { stdin: '7', out: 'Prime' },
                { stdin: '1', out: 'Not prime' },
                { stdin: '15', out: 'Not prime' },
                { stdin: '97', out: 'Prime', hidden: true },
                { stdin: '2', out: 'Prime', hidden: true },
                { stdin: '999983', out: 'Prime', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Lists and Dictionaries',
          description: 'Storing and processing collections of data.',
          steps: [
            theory('Lists and Dictionaries', 10, t`
# Lists and Dictionaries

## Lists

An ordered, **mutable** collection:

¦¦¦python
nums = [4, 8, 15]
nums.append(16)
nums[0] = 3
len(nums)          # 4
sorted(nums)       # new sorted list
sum(nums), max(nums), min(nums)
¦¦¦

Turn a line of numbers into a list in one expression:

¦¦¦python
values = [int(x) for x in input().split()]
¦¦¦

## Dictionaries

A dictionary maps **keys** to **values** with fast lookup:

¦¦¦python
ages = {"ada": 36, "grace": 85}
ages["alan"] = 41
ages.get("bob", 0)       # 0, no error for missing keys
for name, age in ages.items():
    print(name, age)
¦¦¦

The counting idiom you will use constantly:

¦¦¦python
counts = {}
for word in words:
    counts[word] = counts.get(word, 0) + 1
¦¦¦

## Mutable or not?

Lists and dictionaries can change after creation; strings and tuples cannot. Mutable objects shared between names change for everyone, so copy with ¦list(x)¦ or ¦x.copy()¦ when you need an independent version.
`),
            quiz('Mutability', 'multiple_choice',
              'Which of these types are mutable?',
              [['list', true], ['dict', true], ['tuple', false], ['str', false]],
              'Lists and dictionaries can be modified in place. Tuples and strings are immutable: operations on them create new objects.'),
            py('Word Frequency', 12, {
              statement:
                'Read one line of words separated by spaces. Treat words case-insensitively. Print each distinct word and how many times it occurs, one per line as word: count, sorted alphabetically.',
              input: 'A single line of space-separated words.',
              output: 'Lines of the form word: count in alphabetical order.',
              constraints: 'At most 1000 words.',
              starter: t`
words = input().lower().split()
counts = {}
# fill counts, then print in sorted order
`,
              solution: t`
words = input().lower().split()
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
for w in sorted(counts):
    print(f"{w}: {counts[w]}")
`,
              hints: ['dict.get(key, 0) avoids a KeyError for new words.', 'sorted(counts) returns the keys in alphabetical order.'],
              explanation: 'Count with a dictionary, then iterate over its sorted keys.',
              tests: [
                { stdin: 'the cat the dog', out: 'cat: 1\ndog: 1\nthe: 2' },
                { stdin: 'b a b a b', out: 'a: 2\nb: 3', hidden: true },
                { stdin: 'Go go GO', out: 'go: 3', hidden: true },
              ],
            }),
            py('Second Largest', 10, {
              statement: 'Read a line of integers and print the second largest distinct value. The input always contains at least two distinct values.',
              input: 'A single line of space-separated integers.',
              output: 'The second largest distinct integer.',
              constraints: '2 <= count <= 1000',
              starter: t`
values = [int(x) for x in input().split()]
`,
              solution: t`
values = [int(x) for x in input().split()]
distinct = sorted(set(values), reverse=True)
print(distinct[1])
`,
              hints: ['set(values) removes duplicates.', 'Sort descending and take the element at index 1.'],
              explanation: 'Deduplicate with a set, sort high to low, and pick the second item.',
              tests: [
                { stdin: '3 1 4 1 5', out: '4' },
                { stdin: '10 10 9', out: '9' },
                { stdin: '-1 -5 -3', out: '-3', hidden: true },
              ],
            }),
            py('Mini Project: Shopping Cart', 15, {
              statement:
                'Each input line has the form name price quantity (for example apple 0.5 4). Read lines until the input ends and print the total cost with exactly two decimal places.',
              input: 'Zero or more lines of name price quantity.',
              output: 'The total, formatted with two decimals.',
              constraints: 'At most 100 lines. Prices are positive decimals, quantities are positive integers.',
              starter: t`
import sys

total = 0.0
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    # split the line and add price * quantity to total
`,
              solution: t`
import sys

total = 0.0
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    name, price, qty = line.split()
    total += float(price) * int(qty)
print(f"{total:.2f}")
`,
              hints: ['sys.stdin yields one line at a time until the input ends.', 'Convert price with float() and quantity with int().'],
              explanation: 'This combines loops, string splitting, type conversion and formatting from the whole course.',
              tests: [
                { stdin: 'apple 0.5 4\nbread 2.25 1', out: '4.25' },
                { stdin: 'milk 1.2 3', out: '3.60', hidden: true },
                { stdin: '', out: '0.00', hidden: true },
              ],
            }),
          ],
        },
      ],
};
