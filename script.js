function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

function multiply(a, b) {
    return a * b;
}

function divide(a, b) {
    if (b === 0) {
        throw new Error("Cannot divide by zero");
    }
    return a / b;
} 

function operate(operator, a, b) {
    switch (operator){
        case '+':
            return add(a,b);
        case '-':
            return subtract(a,b);
        case '*':
            return multiply(a,b);
        case '/':
            return divide(a,b);
        default:
            throw new Error("Invalid operator");  
    }
} 

console.log(operate("+", 5, 3));
console.log(operate("-", 5, 3));
console.log(operate("*", 5, 3));
console.log(operate("/", 6, 3));