#include <iostream>

int main()
{
    int prices[5] = {100, 101, 102, 103, 104};

    int* begin = prices;
    int* end = prices + 5;

    int sum = 0;

    for (int* p = begin; p != end; ++p)
    {
        sum += *p;
    }

    std::cout << "Average = "
              << sum / 5
              << '\n';

    return 0;
}