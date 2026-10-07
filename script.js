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
    switch (operator) {
        case '+':
            return add(a, b);
        case '-':
            return subtract(a, b);
        case '*':
            return multiply(a, b);
        case '/':
            return divide(a, b);
        default:
            throw new Error("Invalid operator");
    }
}

let firstNumber = "";
let secondNumber = "";
let operator = "";
let justPressedEquals = false;
let pendingNumber = "";
let pendingOperator = "";

const answer = document.querySelector("#answer");
const buttons = document.querySelectorAll(".buttons button");
const expression = document.querySelector("#expression");

buttons.forEach(function(button) {
    button.addEventListener("click", function() {
        if (button.textContent === "C") {
            firstNumber = "";
            secondNumber = "";
            operator = "";
            pendingNumber = "";
            pendingOperator = "";
            expression.textContent = "";
            answer.textContent = "";
            justPressedEquals = false;
        }

        else if (button.textContent === "+" || button.textContent === "-" || button.textContent === "*" || button.textContent === "/") {
            if (justPressedEquals) {
                expression.textContent = firstNumber;
                answer.textContent = "";
                justPressedEquals = false;
            }

            if (secondNumber !== "") {
                try {
                    if ((button.textContent === "*" || button.textContent === "/") && (operator === "+" || operator === "-")) {
                        // PEMDAS: hold the + or - until the * or / is done
                        pendingNumber = firstNumber;
                        pendingOperator = operator;
                        firstNumber = secondNumber;
                        secondNumber = "";
                    } else {
                        let result = operate(operator, parseFloat(firstNumber), parseFloat(secondNumber));
                        if ((button.textContent === "+" || button.textContent === "-") && pendingOperator !== "") {
                            result = operate(pendingOperator, parseFloat(pendingNumber), result);
                            pendingNumber = "";
                            pendingOperator = "";
                        }
                        firstNumber = result.toString();
                        secondNumber = "";
                    }
                } catch (error) {
                    firstNumber = "";
                    secondNumber = "";
                    operator = "";
                    pendingNumber = "";
                    pendingOperator = "";
                    expression.textContent = "";
                    answer.textContent = error.message;
                    return;
                }
            }

            operator = button.textContent;
            expression.textContent += button.textContent;
        }

        else if (button.textContent === "=") {
            try {
                if (firstNumber !== "" && secondNumber !== "" && operator !== "") {
                    let result = operate(operator, parseFloat(firstNumber), parseFloat(secondNumber));
                    if (pendingOperator !== "") {
                        result = operate(pendingOperator, parseFloat(pendingNumber), result);
                        pendingNumber = "";
                        pendingOperator = "";
                    }
                    result = Math.round(result * 1000000) / 1000000;
                    answer.textContent = result;
                    firstNumber = result.toString();
                    secondNumber = "";
                    operator = "";
                    justPressedEquals = true;
                }
            } catch (error) {
                pendingNumber = "";
                pendingOperator = "";
                answer.textContent = error.message;
            }
        }

        else if (justPressedEquals) {
            firstNumber = button.textContent;
            secondNumber = "";
            expression.textContent = button.textContent;
            answer.textContent = "";
            justPressedEquals = false;
        }

        else if (operator !== "") {
            expression.textContent += button.textContent;
            secondNumber += button.textContent;
        }

        else {
            expression.textContent += button.textContent;
            firstNumber += button.textContent;
        }
    });
});
