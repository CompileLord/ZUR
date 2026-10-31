import { t, theory, video, quiz, py, type ModuleDef } from '../helpers.ts';

export const gettingStartedModule: ModuleDef = {
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
};
