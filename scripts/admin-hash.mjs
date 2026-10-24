#!/usr/bin/env node
/**
 * Generates the bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run admin:hash                     # asks for the password twice without echoing it
 *   printf '%s' "$PASS" | npm run admin:hash   # non-interactive (stdin is not a terminal)
 */
import bcrypt from 'bcrypt';
import readline from 'node:readline';

const MIN_LENGTH = 12;
const COST = 12;

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Print the prompt but nothing of what is typed
    rl._writeToOutput = (text) => {
      if (text.includes(prompt)) rl.output.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0];
}

async function main() {
  let password;

  if (process.stdin.isTTY) {
    password = await askHidden('Contraseña del administrador: ');
    const confirmation = await askHidden('Repita la contraseña: ');
    if (password !== confirmation) {
      throw new Error('Las contraseñas no coinciden.');
    }
  } else {
    password = await readStdin();
  }

  if (password.length < MIN_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
  }

  const hash = await bcrypt.hash(password, COST);
  console.log(`\nADMIN_PASSWORD_HASH=${hash}`);
  console.error(
    '\nPéguelo tal cual en .env. En un shell o en un env_file de compose, escriba el valor entre' +
      "\ncomillas simples o duplique cada $ ($$), porque el hash contiene el carácter $.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
