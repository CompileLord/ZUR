import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const inheritanceAndPolymorphismModule: ModuleDef = {
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
};
