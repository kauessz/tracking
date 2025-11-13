// tests/utilities.test.js
// Testes unitários para utilities.js
// ====================================
// 
// Para rodar os testes:
// 1. npm install --save-dev jest @babel/preset-env
// 2. Configurar babel.config.js (veja abaixo)
// 3. npm test
//

import { Validator, Format, Parse, Delay } from '../public/js/utilities.js';

describe('Validator', () => {
  describe('email', () => {
    test('valida emails corretos', () => {
      expect(Validator.email('teste@exemplo.com')).toBe(true);
      expect(Validator.email('user.name@company.co.uk')).toBe(true);
      expect(Validator.email('user+tag@example.com')).toBe(true);
    });

    test('rejeita emails inválidos', () => {
      expect(Validator.email('invalido')).toBe(false);
      expect(Validator.email('sem@dominio')).toBe(false);
      expect(Validator.email('@exemplo.com')).toBe(false);
      expect(Validator.email('teste@')).toBe(false);
    });
  });

  describe('password', () => {
    test('valida senha com mínimo de caracteres', () => {
      const result1 = Validator.password('12345');
      expect(result1.valid).toBe(false);
      expect(result1.message).toContain('6 caracteres');

      const result2 = Validator.password('123456');
      expect(result2.valid).toBe(true);
    });
  });

  describe('required', () => {
    test('valida campos obrigatórios', () => {
      const result1 = Validator.required('', 'Nome');
      expect(result1.valid).toBe(false);
      expect(result1.message).toBe('Nome é obrigatório');

      const result2 = Validator.required('João', 'Nome');
      expect(result2.valid).toBe(true);
    });
  });

  describe('form', () => {
    test('valida formulário completo', () => {
      const formData = {
        email: 'teste@exemplo.com',
        nome: 'João Silva',
        senha: '123456'
      };

      const rules = {
        email: [
          (v) => Validator.required(v, 'Email'),
          (v) => Validator.email(v) ? { valid: true } : { valid: false, message: 'Email inválido' }
        ],
        nome: [(v) => Validator.required(v, 'Nome')],
        senha: [(v) => Validator.password(v)]
      };

      const result = Validator.form(formData, rules);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    test('retorna erros de validação', () => {
      const formData = {
        email: 'invalido',
        nome: '',
        senha: '123'
      };

      const rules = {
        email: [
          (v) => Validator.email(v) ? { valid: true } : { valid: false, message: 'Email inválido' }
        ],
        nome: [(v) => Validator.required(v, 'Nome')],
        senha: [(v) => Validator.password(v)]
      };

      const result = Validator.form(formData, rules);
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('Email inválido');
      expect(result.errors.nome).toBe('Nome é obrigatório');
      expect(result.errors.senha).toContain('6 caracteres');
    });
  });
});

describe('Format', () => {
  describe('dateTime', () => {
    test('formata data e hora corretamente', () => {
      const date = new Date('2025-11-10T14:30:00');
      expect(Format.dateTime(date)).toBe('10/11/2025 14:30');
    });

    test('retorna "—" para data inválida', () => {
      expect(Format.dateTime(null)).toBe('—');
      expect(Format.dateTime('invalido')).toBe('—');
    });
  });

  describe('date', () => {
    test('formata apenas data', () => {
      const date = new Date('2025-11-10');
      expect(Format.date(date)).toBe('10/11/2025');
    });
  });

  describe('duration', () => {
    test('formata minutos em HH:mm', () => {
      expect(Format.duration(0)).toBe('00:00');
      expect(Format.duration(65)).toBe('01:05');
      expect(Format.duration(125)).toBe('02:05');
      expect(Format.duration(1440)).toBe('24:00');
    });
  });

  describe('currency', () => {
    test('formata valores monetários', () => {
      expect(Format.currency(1500)).toBe('R$ 1.500,00');
      expect(Format.currency(1234.56)).toBe('R$ 1.234,56');
    });
  });

  describe('number', () => {
    test('formata números com separadores', () => {
      expect(Format.number(1000)).toBe('1.000');
      expect(Format.number(1234567)).toBe('1.234.567');
      expect(Format.number(1234.567, 2)).toBe('1.234,57');
    });
  });
});

describe('Parse', () => {
  describe('dateTimeBR', () => {
    test('parseia data brasileira com hora', () => {
      const date = Parse.dateTimeBR('10/11/2025 14:30');
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(10); // Novembro = 10 (0-indexed)
      expect(date.getDate()).toBe(10);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
    });

    test('retorna null para formato inválido', () => {
      expect(Parse.dateTimeBR('10-11-2025 14:30')).toBeNull();
      expect(Parse.dateTimeBR('invalid')).toBeNull();
      expect(Parse.dateTimeBR(null)).toBeNull();
    });
  });

  describe('dateBR', () => {
    test('parseia data brasileira sem hora', () => {
      const date = Parse.dateBR('10/11/2025');
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(10);
      expect(date.getDate()).toBe(10);
    });
  });

  describe('excelSerial', () => {
    test('converte número serial do Excel', () => {
      // 1 = 01/01/1900
      const date = Parse.excelSerial(45508); // 10/07/2024
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2024);
    });

    test('retorna null para número inválido', () => {
      expect(Parse.excelSerial(NaN)).toBeNull();
      expect(Parse.excelSerial(Infinity)).toBeNull();
    });
  });

  describe('dateAuto', () => {
    test('detecta e parseia múltiplos formatos', () => {
      // Formato BR
      const date1 = Parse.dateAuto('10/11/2025 14:30');
      expect(date1).not.toBeNull();

      // Número Excel
      const date2 = Parse.dateAuto(45508);
      expect(date2).not.toBeNull();

      // ISO
      const date3 = Parse.dateAuto('2025-11-10T14:30:00');
      expect(date3).not.toBeNull();

      // Date object
      const now = new Date();
      const date4 = Parse.dateAuto(now);
      expect(date4).toEqual(now);
    });
  });
});

describe('Delay', () => {
  describe('calculateMinutes', () => {
    test('calcula atraso em minutos', () => {
      const op = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 11:30'
      };

      const delay = Delay.calculateMinutes(op);
      expect(delay).toBe(90); // 1h30min = 90min
    });

    test('retorna 0 para operações no prazo', () => {
      const op = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 09:00'
      };

      const delay = Delay.calculateMinutes(op);
      expect(delay).toBe(0);
    });

    test('retorna 0 quando não há data programada', () => {
      const op = { DataChegada: '10/11/2025 10:00' };
      expect(Delay.calculateMinutes(op)).toBe(0);
    });
  });

  describe('isLate', () => {
    test('identifica operações atrasadas', () => {
      const opAtrasada = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 11:00'
      };
      expect(Delay.isLate(opAtrasada)).toBe(true);

      const opNoPrazo = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 09:00'
      };
      expect(Delay.isLate(opNoPrazo)).toBe(false);
    });
  });

  describe('getStatus', () => {
    test('classifica atrasos por gravidade', () => {
      const opNoPrazo = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 09:00'
      };
      expect(Delay.getStatus(opNoPrazo).status).toBe('on-time');

      const opLeveAtraso = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 10:30'
      };
      expect(Delay.getStatus(opLeveAtraso).status).toBe('slight');

      const opModerado = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 11:30'
      };
      expect(Delay.getStatus(opModerado).status).toBe('moderate');

      const opGrave = {
        DataProgramada: '10/11/2025 10:00',
        DataChegada: '10/11/2025 15:00'
      };
      expect(Delay.getStatus(opGrave).status).toBe('severe');
    });
  });
});

// ============================================
// CONFIGURAÇÃO DO BABEL
// ============================================
//
// Crie um arquivo babel.config.js na raiz do projeto:
//
// module.exports = {
//   presets: [
//     ['@babel/preset-env', { targets: { node: 'current' } }]
//   ]
// };
//
// ============================================
// PACKAGE.JSON
// ============================================
//
// Adicione no package.json:
//
// {
//   "scripts": {
//     "test": "jest",
//     "test:watch": "jest --watch",
//     "test:coverage": "jest --coverage"
//   },
//   "devDependencies": {
//     "@babel/preset-env": "^7.23.0",
//     "jest": "^29.7.0"
//   }
// }
//
// ============================================
// EXECUTAR TESTES
// ============================================
//
// npm test                 # Roda todos os testes
// npm run test:watch       # Modo watch (re-roda ao salvar)
// npm run test:coverage    # Gera relatório de cobertura
//