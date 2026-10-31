import { t, theory, video, quiz, py, type CourseDef } from './helpers.ts';

export const pythonFundamentals: CourseDef = {
  slug: 'python-fundamentals',
  mentorEmail: 'elena.marsh@zur.local',
  title: 'Python Fundamentals: From Zero to Scripts',
  description:
    'A hands-on first course in Python. Learn to think in code through short lessons, quizzes and 17 graded exercises covering variables, decisions, loops, strings, functions, lists and dictionaries.',
  tags: ['python', 'beginner', 'fundamentals'],
  difficulty: 'beginner',
  outcomes: [
    'Read and write simple Python programs that take input and produce output',
    'Use variables, numbers, strings and booleans correctly',
    'Control program flow with if/elif/else, for and while',
    'Break problems into reusable functions',
    'Store and process data with lists and dictionaries',
  ],
  prerequisites: 'None. Suitable for complete beginners.',
  modules: [
    {
      title: 'Getting Started',
      lessons: [
        {
          title: 'Your First Program',
          description: 'What Python is, how programs run, and printing output.',
          steps: [
            theory('Meet Python', 6, t`
# Meet Python

Python is a general-purpose programming language known for readable code. It is used for web backends, data analysis, automation, machine learning and teaching, often by the same people in the same week.

## A program is a list of instructions

A Python program is a text file of statements the interpreter runs from top to bottom. The simplest useful statement shows something on screen:

¦¦¦python
print("Hello, world!")
¦¦¦

Run it and you will see ¦Hello, world!¦. The text between quotes is a **string**; ¦print¦ is a **function** that writes its argument to the output.

## Several things at once

¦print¦ accepts several values and separates them with a space:

¦¦¦python
print("Python", 3, "is fun")   # Python 3 is fun
¦¦¦

Everything after ¦#¦ on a line is a **comment**: Python ignores it, humans read it.

## How exercises work here

In the coding steps of this course your program reads from **standard input** and writes to **standard output**. A hidden checker feeds your program several inputs and compares what it prints with the expected output, so printed text must match *exactly*, including capital letters and punctuation.

> Tip: run your code on the sample tests first. Submit only when the samples pass.
`),
            video('Python Overview', 12, 'rfscVS0vtbw',
              'In this overview we install Python, open an editor and write our first program. We look at how the interpreter reads a file line by line, how print outputs values, and how error messages point to the line that failed. Then we preview variables, loops and functions, which the next lessons cover step by step. Pause the video and try each example yourself.'),
            quiz('What does print do?', 'single_choice',
              'What is the output of this program?\n\n¦¦¦python\nprint("Hi", 2)\n¦¦¦'.replaceAll('¦', '`'),
              [['Hi 2', true], ['Hi2', false], ['"Hi" 2', false], ['An error, because the arguments have different types', false]],
              '¦print¦ converts each argument to text and joins them with a single space, so ¦Hi 2¦ is printed. Quotes are only syntax; they are not part of the string.'.replaceAll('¦', '`')),
            py('Hello, Name', 8, {
              statement: 'Read a name from the first line of standard input and print a greeting in the form Hello, <name>!',
              input: 'A single line containing a name.',
              output: 'Hello, <name>! on a single line.',
              constraints: 'The name has between 1 and 50 characters and may contain spaces.',
              starter: t`
# Read the name, then print the greeting
name = input()
`,
              solution: t`
name = input()
print("Hello, " + name + "!")
`,
              hints: ['input() returns the line the user typed, without the newline.', 'Join strings with + or use an f-string: f"Hello, {name}!"'],
              explanation: 'Concatenate the pieces of the greeting around the input. An f-string does the same thing more readably.',
              tests: [
                { stdin: 'Ada', out: 'Hello, Ada!' },
                { stdin: 'Grace Hopper', out: 'Hello, Grace Hopper!' },
                { stdin: 'Linus', out: 'Hello, Linus!', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Variables and Types',
          description: 'Names, numbers, text, booleans and converting between them.',
          steps: [
            theory('Variables and Basic Types', 8, t`
# Variables and Basic Types

A **variable** is a name bound to a value. You create one by assigning with ¦=¦:

¦¦¦python
age = 30
price = 19.99
name = "Ada"
is_member = True
¦¦¦

## The four basic types

- ¦int¦: whole numbers, e.g. ¦42¦, ¦-7¦
- ¦float¦: numbers with a fractional part, e.g. ¦3.14¦
- ¦str¦: text, e.g. ¦"hello"¦
- ¦bool¦: ¦True¦ or ¦False¦

Use ¦type(x)¦ to see what a value is.

## Arithmetic

¦+ - * /¦ do what you expect. Remember: ¦/¦ always produces a float (¦7 / 2¦ is ¦3.5¦), ¦//¦ is floor division (¦7 // 2¦ is ¦3¦), ¦%¦ is the remainder and ¦**¦ is a power.

## Input is always text

¦input()¦ always returns a ¦str¦. Convert before doing maths:

¦¦¦python
n = int(input())      # "12" -> 12
x = float(input())    # "3.5" -> 3.5
¦¦¦

Forgetting this is the most common beginner bug: ¦"3" + "4"¦ is ¦"34"¦, not ¦7¦.

## Naming rules

Names may contain letters, digits and underscores, cannot start with a digit and cannot be a keyword such as ¦if¦ or ¦for¦. By convention Python uses ¦snake_case¦.
`),
            quiz('Valid variable names', 'multiple_choice',
              'Select every valid Python variable name.',
              [['total_1', true], ['2fast', false], ['_hidden', true], ['my-var', false]],
              '¦2fast¦ starts with a digit and ¦my-var¦ contains a minus sign, which Python reads as subtraction. Letters, digits and underscores are fine as long as the first character is not a digit.'.replaceAll('¦', '`')),
            py('Rectangle Area', 8, {
              statement: 'Read the width and height of a rectangle (one integer per line) and print its area.',
              input: 'Two lines: width, then height.',
              output: 'A single integer: the area.',
              constraints: '0 <= width, height <= 10^6',
              starter: t`
width = int(input())
height = int(input())
# print the area
`,
              solution: t`
width = int(input())
height = int(input())
print(width * height)
`,
              hints: ['Both values arrive as strings; the starter already converts them.', 'Area is width multiplied by height.'],
              explanation: 'After converting both inputs to int, multiply them and print the result.',
              tests: [
                { stdin: '3\n4', out: '12' },
                { stdin: '10\n10', out: '100' },
                { stdin: '7\n0', out: '0', hidden: true },
              ],
            }),
            py('Temperature Converter', 10, {
              statement: 'Read a temperature in Celsius and print it in Fahrenheit rounded to one decimal place.',
              input: 'A single number (may be negative or have decimals).',
              output: 'The Fahrenheit value with exactly one digit after the decimal point.',
              constraints: '-273.15 <= C <= 1000',
              starter: t`
celsius = float(input())
# F = C * 9 / 5 + 32
`,
              solution: t`
celsius = float(input())
fahrenheit = celsius * 9 / 5 + 32
print(f"{fahrenheit:.1f}")
`,
              hints: ['Use the formula F = C * 9 / 5 + 32.', 'f"{value:.1f}" formats a float with one decimal place.'],
              explanation: 'Apply the formula, then use the ¦.1f¦ format specifier to print exactly one decimal.'.replaceAll('¦', '`'),
              tests: [
                { stdin: '100', out: '212.0' },
                { stdin: '0', out: '32.0' },
                { stdin: '-40', out: '-40.0', hidden: true },
                { stdin: '36.6', out: '97.9', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ],
};
