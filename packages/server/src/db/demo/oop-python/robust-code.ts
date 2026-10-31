import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const robustCodeModule: ModuleDef = {
      title: 'Writing Robust Code',
      lessons: [
        {
          title: 'Exceptions',
          description: 'Catching, raising and defining errors.',
          steps: [
            theory('try, except, raise', 10, t`
# Exceptions

When something goes wrong Python **raises an exception**. Unhandled, it stops the program with a traceback. You can handle it:

¦¦¦python
try:
    n = int(input())
    print(100 / n)
except ValueError:
    print("Not a number")
except ZeroDivisionError:
    print("Cannot divide by zero")
else:
    print("No error happened")
finally:
    print("Always runs")
¦¦¦

- ¦except¦ clauses are tried in order; catch **specific** exceptions, not a bare ¦except:¦.
- ¦else¦ runs only when no exception occurred.
- ¦finally¦ always runs, which makes it the place to release resources.

## Raising your own

¦¦¦python
def set_age(age):
    if age < 0:
        raise ValueError("age cannot be negative")
¦¦¦

## Custom exception types

¦¦¦python
class InvalidAgeError(Exception):
    pass
¦¦¦

Callers can now catch *exactly* your error. Name them after what went wrong and inherit from ¦Exception¦.

## Easier to ask forgiveness

Python style prefers trying the operation and handling failure (EAFP) over pre-checking every possibility (LBYL), especially when checks are racy or complicated.
`),
            quiz('Exception flow', 'multiple_choice',
              'Select all true statements about try/except.',
              [
                ['finally runs whether or not an exception was raised', true],
                ['else runs only if the try block raised no exception', true],
                ['A bare except: is the recommended way to catch everything', false],
                ['Custom exceptions should usually inherit from Exception', true],
              ],
              'A bare except also swallows KeyboardInterrupt and hides bugs. Catch the narrowest exception that you can actually handle.'),
            py('Safe Divide', 12, {
              statement: 'Read two values a and b on one line. Print a / b as a float. If b is zero print Cannot divide by zero. If either value is not a number print Invalid input.',
              input: 'One line: a b',
              output: 'The quotient, or one of the two error messages.',
              constraints: 'Exactly two tokens on the line.',
              starter: t`
line = input().split()

try:
    a = float(line[0])
    b = float(line[1])
    # print a / b
except ...:
    pass
`,
              solution: t`
line = input().split()

try:
    a = float(line[0])
    b = float(line[1])
    print(a / b)
except ValueError:
    print("Invalid input")
except ZeroDivisionError:
    print("Cannot divide by zero")
`,
              hints: ['float("x") raises ValueError; a / 0.0 raises ZeroDivisionError.', 'Use two separate except clauses.'],
              explanation: 'Each failure mode raises a different exception, so each gets its own handler and message.',
              tests: [
                { stdin: '10 2', out: '5.0' },
                { stdin: '5 0', out: 'Cannot divide by zero' },
                { stdin: 'x 3', out: 'Invalid input' },
                { stdin: '7 2', out: '3.5', hidden: true },
              ],
            }),
            py('Custom Exception', 12, {
              statement: 'Define InvalidAgeError and validate_age(age), which raises it when age is below 0 or above 150. Print Valid, or Invalid age: <age> if the error is raised.',
              input: 'A single integer age.',
              output: 'Valid or Invalid age: <age>',
              constraints: '-1000 <= age <= 1000',
              starter: t`
class InvalidAgeError(Exception):
    pass


def validate_age(age):
    # raise InvalidAgeError if age < 0 or age > 150
    pass


age = int(input())
try:
    validate_age(age)
    print("Valid")
except InvalidAgeError:
    print(f"Invalid age: {age}")
`,
              solution: t`
class InvalidAgeError(Exception):
    pass


def validate_age(age):
    if age < 0 or age > 150:
        raise InvalidAgeError(age)


age = int(input())
try:
    validate_age(age)
    print("Valid")
except InvalidAgeError:
    print(f"Invalid age: {age}")
`,
              hints: ['raise InvalidAgeError(...) when the check fails.', 'The driver already catches the exception.'],
              explanation: 'A dedicated exception type lets the caller distinguish this failure from any other error.',
              tests: [
                { stdin: '25', out: 'Valid' },
                { stdin: '-3', out: 'Invalid age: -3' },
                { stdin: '200', out: 'Invalid age: 200', hidden: true },
                { stdin: '150', out: 'Valid', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Composition and Design',
          description: 'Building larger systems from cooperating objects.',
          steps: [
            theory('Composition over Inheritance', 10, t`
# Composition over Inheritance

Inheritance models **is-a** ("a Dog is an Animal"). Composition models **has-a** ("a Library has Books"). Prefer composition when objects merely *use* each other: it is more flexible and keeps classes small.

¦¦¦python
class Engine:
    def start(self):
        return "Vroom"


class Car:
    def __init__(self):
        self.engine = Engine()

    def start(self):
        return self.engine.start()
¦¦¦

Swapping the engine for an electric one means changing one line, not restructuring a class hierarchy.

## Single responsibility

A class should have one reason to change. If a class both stores data **and** formats reports **and** talks to a database, split it.

## Tell, don't ask

Instead of reading an object's data to decide what to do with it, ask the object to do the work. That keeps rules in one place.

## A checklist before you write a class

1. What data does it own?
2. Which operations keep that data valid?
3. Which other objects does it collaborate with?
4. Could a plain function do this just as well?

The last question matters: Python does not require everything to be a class.
`),
            quiz('Is-a or has-a?', 'single_choice',
              'You are modelling a ¦Library¦ that stores many ¦Book¦ objects. Which design is most appropriate?'.replaceAll('¦', '`'),
              [['Library holds a collection of Book objects (composition)', true], ['Library inherits from Book', false], ['Book inherits from Library', false], ['Use one class and a global dictionary instead', false]],
              'A library is not a kind of book. It has books, so the Library should own a collection of them.'),
            py('Library System', 20, {
              statement:
                'Implement a Library that tracks which titles are available. Commands: "add T" registers title T as available; "borrow T" prints "Borrowed: T" if T exists and is available, otherwise "Not available: T"; "return T" prints "Returned: T" if T was borrowed, otherwise "Cannot return: T"; "list" prints every currently available title, one per line, in alphabetical order. A title is the rest of the line after the command.',
              input: 'Commands, one per line, until the input ends.',
              output: 'Messages as described above.',
              constraints: 'At most 200 commands; titles may contain spaces.',
              starter: t`
import sys


class Library:
    def __init__(self):
        self.available = {}   # title -> True if on the shelf

    def add(self, title):
        pass

    def borrow(self, title):
        pass

    def give_back(self, title):
        pass

    def available_titles(self):
        pass


library = Library()
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line.strip():
        continue
    command, _, title = line.partition(" ")
    if command == "add":
        library.add(title)
    elif command == "borrow":
        print(("Borrowed: " if library.borrow(title) else "Not available: ") + title)
    elif command == "return":
        print(("Returned: " if library.give_back(title) else "Cannot return: ") + title)
    elif command == "list":
        for name in library.available_titles():
            print(name)
`,
              solution: t`
import sys


class Library:
    def __init__(self):
        self.available = {}   # title -> True if on the shelf

    def add(self, title):
        self.available[title] = True

    def borrow(self, title):
        if self.available.get(title):
            self.available[title] = False
            return True
        return False

    def give_back(self, title):
        if title in self.available and not self.available[title]:
            self.available[title] = True
            return True
        return False

    def available_titles(self):
        return sorted(t for t, free in self.available.items() if free)


library = Library()
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line.strip():
        continue
    command, _, title = line.partition(" ")
    if command == "add":
        library.add(title)
    elif command == "borrow":
        print(("Borrowed: " if library.borrow(title) else "Not available: ") + title)
    elif command == "return":
        print(("Returned: " if library.give_back(title) else "Cannot return: ") + title)
    elif command == "list":
        for name in library.available_titles():
            print(name)
`,
              hints: ['A dictionary from title to availability is enough state.', 'borrow and give_back should return True/False; the driver prints the message.', 'Unknown titles: dict.get returns None, which is falsy.'],
              explanation: 'The Library owns the rules about availability; the driver just maps commands to methods.',
              tests: [
                { stdin: 'add Dune\nborrow Dune\nborrow Dune\nreturn Dune\nreturn Dune', out: 'Borrowed: Dune\nNot available: Dune\nReturned: Dune\nCannot return: Dune' },
                { stdin: 'add B\nadd A\nborrow B\nlist', out: 'Borrowed: B\nA', hidden: true },
                { stdin: 'borrow Ghost', out: 'Not available: Ghost', hidden: true },
              ],
            }),
          ],
        },
      ],
};
