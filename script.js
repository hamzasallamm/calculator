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

let firstNumber = "";
let secondNumber = "";
let operator = "";

const answer = document.querySelector("#answer");
const buttons = document.querySelectorAll(".buttons button");
const expression = document.querySelector("#expression");

buttons.forEach(function(button) {
    button.addEventListener("click", function() {
        if(button.textContent === "C") {
            firstNumber = "";
            secondNumber = "";
            operator = "";
            expression.textContent = "";
            answer.textContent = "";
        }
        
        else if(button.textContent === "+" || button.textContent === "-" || button.textContent === "*" || button.textContent === "/") {
            if (secondNumber !== "") {
                let result = operate(operator, parseFloat(firstNumber), parseFloat(secondNumber));
                firstNumber = result.toString();
                secondNumber = "";
            }

            operator = button.textContent;
            expression.textContent += button.textContent;
        }

        else if(operator !== "" && button.textContent !== "=") {
            expression.textContent += button.textContent;
            secondNumber += button.textContent;
        }

        else if(operator === "") {
            expression.textContent += button.textContent;
            firstNumber += button.textContent;
        }

        else if(button.textContent === "=") {
            try{
                if (firstNumber !== "" && secondNumber !== "" && operator !== "") {
                    let result = operate(operator, parseFloat(firstNumber), parseFloat(secondNumber));
                answer.textContent = Math.round(result * 1000000) / 1000000;
                }
            } catch (error) {
                answer.textContent = error.message;
            }
        }
    })
})