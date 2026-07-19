#include <iostream>
using namespace std;

class Animal {
public:
    virtual void talk() {
        cout << "Animal\n";
    }
};

class Cat : public Animal {
public:
    void talk() override {
        cout << "Meow\n";
    }
};

int main() {
    Cat cat;
    Animal* p = &cat;

    p->talk();
}