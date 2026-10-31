import { t, theory, quiz, py, type CourseDef } from './helpers.ts';

export const oopPython: CourseDef = {
  slug: 'object-oriented-python',
  mentorEmail: 'elena.marsh@zur.local',
  title: 'Object-Oriented Python',
  description:
    'Model real problems with classes. Build up from objects and state to inheritance, special methods, exceptions and composition, with a driver-based exercise in every lesson.',
  tags: ['python', 'oop', 'design'],
  difficulty: 'intermediate',
  outcomes: [
    'Design classes with attributes, methods and clear responsibilities',
    'Reuse behaviour with inheritance and polymorphism',
    'Make your own types feel native with special methods',
    'Handle and raise exceptions deliberately',
    'Choose between inheritance and composition',
  ],
  prerequisites: 'Python Fundamentals, or equivalent comfort with functions, loops, lists and dictionaries.',
  modules: [
    {
      title: 'Classes and Objects',
      lessons: [
        {
          title: 'Your First Class',
          description: 'Classes, instances, __init__ and attributes.',
          steps: [
            theory('Why Classes?', 9, t`
# Why Classes?

Functions and dictionaries get you far, but when data and the operations on it belong together, a **class** keeps them in one place.

¦¦¦python
class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def describe(self):
        return f"{self.name} is {self.age} years old"

rex = Dog("Rex", 3)
print(rex.describe())     # Rex is 3 years old
¦¦¦

## Vocabulary

- **Class**: the blueprint (¦Dog¦).
- **Instance / object**: one thing built from it (¦rex¦).
- **Attribute**: data stored on an instance (¦self.name¦).
- **Method**: a function defined in a class. Its first parameter is the instance, conventionally called ¦self¦.
- **¦__init__¦**: the initialiser, run automatically when you call ¦Dog(...)¦.

## What is self?

When you write ¦rex.describe()¦ Python calls ¦Dog.describe(rex)¦. ¦self¦ is simply the object the method was called on, which is how each instance keeps its own data.

## Class vs instance attributes

Attributes assigned on ¦self¦ belong to one instance. Names assigned directly in the class body are shared by all instances; use them for constants, not per-object state.
`),
            quiz('What is self?', 'single_choice',
              'Inside a method, what does ¦self¦ refer to?'.replaceAll('¦', '`'),
              [['The instance the method was called on', true], ['The class itself', false], ['The module that defines the class', false], ['A reserved keyword that cannot be renamed', false]],
              '¦self¦ is an ordinary parameter name (a strong convention, not a keyword) that receives the instance automatically.'.replaceAll('¦', '`')),
            py('Dog Introduction', 10, {
              statement: 'Complete the Dog class. Its describe() method must return "<name> is <age> years old". The driver code reads the name and age and prints the description.',
              input: 'Two lines: the dog name, then the age (integer).',
              output: '<name> is <age> years old',
              constraints: '0 <= age <= 30',
              starter: t`
class Dog:
    def __init__(self, name, age):
        # store name and age on the instance
        pass

    def describe(self):
        pass


name = input()
age = int(input())
dog = Dog(name, age)
print(dog.describe())
`,
              solution: t`
class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def describe(self):
        return f"{self.name} is {self.age} years old"


name = input()
age = int(input())
dog = Dog(name, age)
print(dog.describe())
`,
              hints: ['Assign to self.name and self.age inside __init__.', 'describe returns a string; the driver does the printing.'],
              explanation: '__init__ saves the constructor arguments as attributes and describe formats them.',
              tests: [
                { stdin: 'Rex\n3', out: 'Rex is 3 years old' },
                { stdin: 'Bella\n12', out: 'Bella is 12 years old' },
                { stdin: 'Pup\n0', out: 'Pup is 0 years old', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'State and Methods',
          description: 'Objects that change over time and protect their own data.',
          steps: [
            theory('Objects with State', 9, t`
# Objects with State

Objects shine when they carry **state** that changes through well-named methods.

¦¦¦python
class Counter:
    def __init__(self):
        self.value = 0

    def increment(self, by=1):
        self.value += by
        return self.value
¦¦¦

## Keep invariants inside the class

A bank account should never silently go negative. Put that rule in the method that changes the balance so every caller gets it for free:

¦¦¦python
def withdraw(self, amount):
    if amount > self.balance:
        return False
    self.balance -= amount
    return True
¦¦¦

## Public vs "private"

Python has no enforced private members. A leading underscore (¦self._balance¦) tells other programmers "internal, please use the methods". Respect it and callers can never break your invariants by accident.

## Properties

Expose a computed or validated value as if it were an attribute:

¦¦¦python
class Rectangle:
    def __init__(self, w, h):
        self.w, self.h = w, h

    @property
    def area(self):
        return self.w * self.h
¦¦¦

¦rect.area¦ now reads like data but is always up to date.
`),
            quiz('Good class design', 'multiple_choice',
              'Which statements describe good use of methods and state?',
              [
                ['Validation rules live in the methods that change the data', true],
                ['A leading underscore signals an attribute is internal', true],
                ['Every attribute should be public so callers can edit it freely', false],
                ['A @property can compute a value from other attributes', true],
              ],
              'Putting rules next to the data keeps the class consistent. Unrestricted public mutation defeats the purpose of encapsulation.'),
            py('Bank Account', 15, {
              statement:
                'Implement the Account class. Commands arrive one per line: "deposit X" adds X, "withdraw X" subtracts X, and "balance" prints "Balance: <amount>". A withdrawal larger than the balance must print "Insufficient funds" and leave the balance unchanged. New accounts start at 0.',
              input: 'Lines: deposit <int>, withdraw <int> or balance.',
              output: 'One output line per balance command, plus "Insufficient funds" for rejected withdrawals.',
              constraints: 'At most 100 commands; amounts are positive integers.',
              starter: t`
import sys


class Account:
    def __init__(self):
        self.balance = 0

    def deposit(self, amount):
        pass

    def withdraw(self, amount):
        # return True on success, False if funds are insufficient
        pass


account = Account()
for line in sys.stdin:
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "deposit":
        account.deposit(int(parts[1]))
    elif parts[0] == "withdraw":
        if not account.withdraw(int(parts[1])):
            print("Insufficient funds")
    elif parts[0] == "balance":
        print(f"Balance: {account.balance}")
`,
              solution: t`
import sys


class Account:
    def __init__(self):
        self.balance = 0

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            return False
        self.balance -= amount
        return True


account = Account()
for line in sys.stdin:
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "deposit":
        account.deposit(int(parts[1]))
    elif parts[0] == "withdraw":
        if not account.withdraw(int(parts[1])):
            print("Insufficient funds")
    elif parts[0] == "balance":
        print(f"Balance: {account.balance}")
`,
              hints: ['withdraw should return a boolean the driver can test.', 'Compare against self.balance before subtracting.'],
              explanation: 'The class owns the rule "never overdraw"; the driver only reacts to the result.',
              tests: [
                { stdin: 'deposit 100\nwithdraw 30\nbalance', out: 'Balance: 70' },
                { stdin: 'deposit 50\nwithdraw 80\nbalance', out: 'Insufficient funds\nBalance: 50' },
                { stdin: 'balance', out: 'Balance: 0', hidden: true },
                { stdin: 'deposit 10\ndeposit 15\nwithdraw 25\nbalance\nwithdraw 1', out: 'Balance: 0\nInsufficient funds', hidden: true },
              ],
            }),
            py('Rectangle Class', 12, {
              statement: 'Implement Rectangle with an area and a perimeter property and an is_square method. Print Area, Perimeter and whether it is a square.',
              input: 'Two integers on one line: width height.',
              output: 'Three lines: Area: A, Perimeter: P, Square: Yes/No',
              constraints: '1 <= width, height <= 1000',
              starter: t`
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        pass

    @property
    def perimeter(self):
        pass

    def is_square(self):
        pass


w, h = (int(x) for x in input().split())
r = Rectangle(w, h)
print(f"Area: {r.area}")
print(f"Perimeter: {r.perimeter}")
print("Square: " + ("Yes" if r.is_square() else "No"))
`,
              solution: t`
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height

    @property
    def perimeter(self):
        return 2 * (self.width + self.height)

    def is_square(self):
        return self.width == self.height


w, h = (int(x) for x in input().split())
r = Rectangle(w, h)
print(f"Area: {r.area}")
print(f"Perimeter: {r.perimeter}")
print("Square: " + ("Yes" if r.is_square() else "No"))
`,
              hints: ['Properties are accessed without parentheses.', 'Perimeter is twice the sum of the sides.'],
              explanation: 'Properties compute values on demand so they can never be out of date.',
              tests: [
                { stdin: '3 4', out: 'Area: 12\nPerimeter: 14\nSquare: No' },
                { stdin: '5 5', out: 'Area: 25\nPerimeter: 20\nSquare: Yes', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
    {
      title: 'Inheritance and Polymorphism',
      lessons: [
        {
          title: 'Inheritance',
          description: 'Reusing and specialising behaviour.',
          steps: [
            theory('Inheritance and super()', 9, t`
# Inheritance and super()

A **subclass** reuses and extends a **base class**:

¦¦¦python
class Animal:
    sound = "..."

    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} says {self.sound}"


class Dog(Animal):
    sound = "Woof"


class Cat(Animal):
    sound = "Meow"
¦¦¦

¦Dog("Rex").speak()¦ gives ¦Rex says Woof¦ without ¦Dog¦ repeating any code.

## Overriding and super()

A subclass may redefine a method. Call ¦super()¦ to run the parent version too:

¦¦¦python
class Puppy(Dog):
    def __init__(self, name, age_months):
        super().__init__(name)
        self.age_months = age_months
¦¦¦

## Polymorphism

Code that calls ¦animal.speak()¦ works for any animal, and each class supplies its own behaviour. You add a new species without touching the code that uses animals.

## isinstance

¦isinstance(rex, Animal)¦ is ¦True¦ because a ¦Dog¦ **is an** ¦Animal¦. If that sentence sounds wrong for two classes, inheritance is probably the wrong tool (see the composition lesson).
`),
            quiz('Method resolution', 'single_choice',
              'Class ¦B(A)¦ inherits from ¦A¦ and does not define ¦greet¦. ¦A¦ does define it. What happens on ¦B().greet()¦?'.replaceAll('¦', '`'),
              [['A.greet runs', true], ['AttributeError', false], ['Nothing happens', false], ['B must call super() explicitly or the method is hidden', false]],
              'Python looks for the method on the instance, then its class, then each base class in order. Calling super() is only needed from a method that overrides the parent version.'),
            py('Animal Sounds', 12, {
              statement: 'Define Dog, Cat and Cow as subclasses of Animal so that speak() returns "<name> says <sound>" with the sounds Woof, Meow and Moo.',
              input: 'One line: kind name (kind is dog, cat or cow).',
              output: '<name> says <sound>',
              constraints: 'kind is always one of the three values.',
              starter: t`
class Animal:
    sound = "..."

    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} says {self.sound}"


# define Dog, Cat and Cow here


kinds = {"dog": Dog, "cat": Cat, "cow": Cow}
kind, name = input().split()
print(kinds[kind](name).speak())
`,
              solution: t`
class Animal:
    sound = "..."

    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} says {self.sound}"


class Dog(Animal):
    sound = "Woof"


class Cat(Animal):
    sound = "Meow"


class Cow(Animal):
    sound = "Moo"


kinds = {"dog": Dog, "cat": Cat, "cow": Cow}
kind, name = input().split()
print(kinds[kind](name).speak())
`,
              hints: ['Each subclass only needs to override the sound class attribute.'],
              explanation: 'speak() is written once in Animal and picks up the subclass sound through self.sound.',
              tests: [
                { stdin: 'dog Rex', out: 'Rex says Woof' },
                { stdin: 'cat Tom', out: 'Tom says Meow' },
                { stdin: 'cow Daisy', out: 'Daisy says Moo', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Special Methods',
          description: 'Make your classes work with print, +, == and more.',
          steps: [
            theory('Dunder Methods', 9, t`
# Special ("dunder") Methods

Methods whose names start and end with double underscores let your class plug into Python syntax.

| You write | Python calls |
| --- | --- |
| ¦str(x)¦ / ¦print(x)¦ | ¦x.__str__()¦ |
| ¦repr(x)¦ | ¦x.__repr__()¦ |
| ¦a + b¦ | ¦a.__add__(b)¦ |
| ¦a == b¦ | ¦a.__eq__(b)¦ |
| ¦len(x)¦ | ¦x.__len__()¦ |
| ¦a < b¦ | ¦a.__lt__(b)¦ |

¦¦¦python
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y

    def __str__(self):
        return f"({self.x}, {self.y})"

print(Vector(1, 2) + Vector(3, 4))   # (4, 6)
¦¦¦

## Guidelines

- ¦__str__¦ is for users; ¦__repr__¦ is for developers (ideally unambiguous).
- Operators should return a **new** object, not mutate the operands.
- If you define ¦__eq__¦ you usually also want a consistent ¦__hash__¦ (or the class becomes unhashable).
`),
            quiz('Which method?', 'single_choice',
              'Which special method controls what ¦print(obj)¦ displays?'.replaceAll('¦', '`'),
              [['__str__', true], ['__init__', false], ['__call__', false], ['__print__', false]],
              'print converts its argument with str(), which calls __str__ (falling back to __repr__ if it is missing). There is no __print__.'),
            py('Vector Class', 12, {
              statement: 'Implement Vector with __add__ and __str__. Read two vectors and print their sum as (x, y).',
              input: 'Two lines, each with two integers: x y.',
              output: 'The sum vector formatted as (x, y).',
              constraints: '-1000 <= x, y <= 1000',
              starter: t`
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        pass

    def __str__(self):
        pass


ax, ay = (int(v) for v in input().split())
bx, by = (int(v) for v in input().split())
print(Vector(ax, ay) + Vector(bx, by))
`,
              solution: t`
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __str__(self):
        return f"({self.x}, {self.y})"


ax, ay = (int(v) for v in input().split())
bx, by = (int(v) for v in input().split())
print(Vector(ax, ay) + Vector(bx, by))
`,
              hints: ['__add__ must return a new Vector.', '__str__ must return a string, not print one.'],
              explanation: 'The + operator calls __add__, and print calls __str__ on the result.',
              tests: [
                { stdin: '1 2\n3 4', out: '(4, 6)' },
                { stdin: '-1 5\n1 -5', out: '(0, 0)', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
    {
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
    },
  ],
};
