'use strict';

const expect = require('chai').expect;
const Parser = require('../lib/parser');
const util   = require('../lib/util');
const ImplementationError = require('flora-errors').ImplementationError;

describe('AST',() => {
    const parser = new Parser();
    let sql;

    function getParsedSql(sql) {
        const ast = parser.parse(sql);
        return util.astToSQL(ast);
    }

    describe('select statement', () => {
        it('should support MySQL query options', () => {
            expect(getParsedSql('SELECT SQL_CALC_FOUND_ROWS SQL_BUFFER_RESULT col1 FROM t'))
                .to.equal('SELECT\n SQL_CALC_FOUND_ROWS SQL_BUFFER_RESULT "col1" \n\nFROM\n "t"');
        });

        describe('expression', () => {
            it('should support asterisk', () => {
                expect(getParsedSql('SELECT * FROM t')).to.equal('SELECT\n * \n\nFROM\n "t"');
            });

            it('should support asterisk prefixed by table', () => {
                expect(getParsedSql('SELECT t.* FROM t')).to.equal('SELECT\n "t".* \n\nFROM\n "t"');
            });

            it('should parse multiple expressions', () => {
                sql = 'SELECT col1 AS a, col2 AS b FROM t';
                expect(getParsedSql(sql)).to.equal('SELECT\n "col1" AS "a",\n "col2" AS "b" \n\nFROM\n "t"');
            });

            it('should escape reserved keywords', () => {
                expect(getParsedSql('SELECT col."select" FROM t'))
                    .to.equal('SELECT\n "col"."select" \n\nFROM\n "t"');
            });

            it('should escape reserved keywords in aliases', () => {
                expect(getParsedSql('SELECT col AS "index" FROM t'))
                    .to.equal('SELECT\n "col" AS "index" \n\nFROM\n "t"');
            });

            it('should escape aliases with non-identifier chars (/a-z0-9_/i)', () => {
                sql = `SELECT col AS "foo bar" FROM t`;
                expect(getParsedSql(sql)).to.contain(`"col" AS "foo bar"`);
            });

            ['"', 'n', 't', '\\'].forEach((char) => {
                it(`should escape char ${char} "`, () => {
                    sql = `SELECT\n ' escape \\${char}'`;
                    expect(getParsedSql(sql)).to.equal(sql);
                });
            });

            it('should handle escaping single quote from ast', () => {
              it(`should escape char '`, () => {
                sql = `SELECT\n ' escape \'\''`;
                expect(getParsedSql(sql)).to.equal(sql);
              });
            });

            it('should support boolean values', () => {
                sql = 'SELECT false, true';
                expect(getParsedSql(sql)).to.equal('SELECT\n FALSE,\n TRUE');
            });

            it('should support parentheses', () => {
                sql = 'SELECT\n (2 + 3) * 4';
                expect(getParsedSql(sql)).to.equal(sql);
            });

            it('should support functions', () => {
                sql = `SELECT\n md5('foo')`;
                expect(getParsedSql(sql)).to.equal(sql);
            });

            it('should support replace functions', () => {
              var ast = {
                type: 'select',
                options: null,
                distinct: null,
                columns: [
                {
                  expr: {
                    type: 'function',
                    name: 'replace',
                    args: {
                        type  : 'expr_list',
                        value : [ { type: 'column_ref', table: null, column: 'd' } ]
                    }
                  },
                  as: null
                }
                ],
                from: [{ db: null, table: 't', as: null }],
                where: null,
                groupby: null,
                limit: null
            };
            var sql = util.astToSQL(ast);
            expect(sql).to.equal('SELECT\n replace("d") \n\nFROM\n "t"');
          });

          it('should support case when functions', () => {
            var ast = {
              type: 'select',
              options: null,
              distinct: null,
              columns: [
                {
                    expr: {
                        type: 'case',
                        expr: null,
                        args: [
                            {
                              cond: {
                                type: 'binary_expr',
                                left: {
                                  column: 'a',
                                  table: null,
                                  type: 'column_ref'
                                },
                                right: {
                                  type: 'number',
                                  value: 1
                                },
                                operator: '>'
                              },
                              result: {
                                type: 'string',
                                value: 'one'
                              },
                              type: 'when'
                            },
                            {
                              cond: {
                                type: 'number',
                                value: 2
                              },
                              result: {
                                type: 'string',
                                value: 'two'
                              },
                              type: 'when'
                            },
                            {
                              result: {
                                type: 'string',
                                value: 'many'
                              },
                              type: 'else'
                            }
                        ]
                    },
                    as: null
                }
            ],
              from: [{ db: null, table: 't', as: null }],
              where: null,
              groupby: null,
              limit: null
          };
          var sql = util.astToSQL(ast);
          expect(sql).to.equal('SELECT\n CASE WHEN "a" > 1 THEN \'one\' WHEN 2 THEN \'two\' ELSE \'many\' END \n\nFROM\n "t"');
        });

        it('should support if functions', () => {
          var ast = {
            type: 'select',
            options: null,
            distinct: null,
            columns: [
              {
                  expr: {
                      type: 'function',
                      name: 'if',
                      args: {
                          type  : 'expr_list',
                          value : [
                            {
                              type: 'binary_expr',
                              left: {
                                column: 'd',
                                table: null,
                                type: 'column_ref'
                              },
                              operator: '>',
                              right: {
                                type: 'number',
                                value: 100
                              }
                            },
                            {
                              type: 'string',
                              value: 'banana'
                            },
                            {
                              type: 'number',
                              value: 34
                            }
                          ]
                      }
                  },
                  as: null
              }
          ],
            from: [{ db: null, table: 't', as: null }],
            where: null,
            groupby: null,
            limit: null
        };
        var sql = util.astToSQL(ast);
        expect(sql).to.equal('SELECT\n if("d" > 100, \'banana\', 34) \n\nFROM\n "t"');
      });

            it('should support aggregate functions', () => {
                sql = 'SELECT COUNT(distinct t.id) FROM t';
                expect(getParsedSql(sql)).to.equal('SELECT\n COUNT(DISTINCT "t"."id") \n\nFROM\n "t"');
            });

            it('should support distinct aggregate functions ', () => {
                var ast = {
                  type: 'select',
                  options: null,
                  distinct: null,
                  columns: [
                  {
                    expr: {
                      type: 'aggr_func',
                      name: 'SUM',
                      args: {
                        distinct: 'DISTINCT',
                        expr: {
                          type: 'column_ref',
                          table: 't',
                          column: 'id'
                        }
                      }
                    },

                    as: null
                  }
                  ],
                  from: [{ db: null, table: 't', as: null }],
                  where: null,
                  groupby: null,
                  limit: null
              };
              var sql = util.astToSQL(ast);
              expect(sql).to.equal('SELECT\n SUM(DISTINCT "t"."id") \n\nFROM\n "t"');
            });


            it('should support unary operators', () => {
                sql = 'SELECT (not true), !t.foo as foo FROM t';
                expect(getParsedSql(sql)).to.equal('SELECT\n (NOT TRUE),\n NOT "t"."foo" AS "foo" \n\nFROM\n "t"');
            });

            it('should support current date function', () => {
                sql = 'Select date_diff(\'day\', money.column1, CURRENT_DATE) as newCol from db.money';
                var ast = parser.parse(sql);
                expect(ast.columns[0].expr.args.value[2].type, 'function');
                expect(ast.columns[0].expr.args.value[2].name, 'CURRENT_DATE');
                expect(getParsedSql(sql)).to.equal('SELECT\n date_diff(\'day\', "money"."column1", CURRENT_DATE) AS "newCol" \n\nFROM\n db."money"');
            });

            it('should support current time function', () => {
                sql = 'Select date_diff(\'day\', money.column1, CURRENT_TIME) as newCol from db.money';
                var ast = parser.parse(sql);
                expect(ast.columns[0].expr.args.value[2].type, 'function');
                expect(ast.columns[0].expr.args.value[2].name, 'CURRENT_TIME');
                expect(getParsedSql(sql)).to.equal('SELECT\n date_diff(\'day\', "money"."column1", CURRENT_TIME) AS "newCol" \n\nFROM\n db."money"');
            });

            it('should support casts', () => {
                expect(getParsedSql('SELECT CAST(col AS INTEGER) FROM t'))
                    .to.equal('SELECT\n CAST("col" AS INTEGER) \n\nFROM\n "t"');
            });

            it('should support try_casts', () => {
              expect(getParsedSql('SELECT TRY_CAST(col AS INTEGER) FROM t'))
                  .to.equal('SELECT\n TRY_CAST("col" AS INTEGER) \n\nFROM\n "t"');
            });

            it('should support casts with double', () => {
              expect(getParsedSql('SELECT CAST(col AS DOUBLE) FROM t'))
                  .to.equal('SELECT\n CAST("col" AS DOUBLE) \n\nFROM\n "t"');
            });

            it('should support casts with boolean', () => {
              expect(getParsedSql('SELECT CAST(col AS BOOLEAN) FROM t'))
                  .to.equal('SELECT\n CAST("col" AS BOOLEAN) \n\nFROM\n "t"');
            });

            it('should support subselects', () => {
                expect(getParsedSql(`SELECT 'string', (SELECT col FROM t2) subSelect FROM t1`))
                    .to.equal(`SELECT\n 'string',\n (SELECT\n "col" \n\nFROM\n "t2") AS "subSelect" \n\nFROM\n "t1"`);
            });

            it('should support subselects in FROM clause', () => {
                expect(getParsedSql('SELECT * FROM (SELECT id FROM t1) AS someAlias'))
                    .to.equal('SELECT\n * \n\nFROM\n (SELECT\n "id" \n\nFROM\n "t1") AS "someAlias"');
            });

            it('should throw an exception for undefined values', () => {
                // flora-mysql uses plain values instead of equivalent expressions, so expressions
                // have to be created by SQL parser
                expect(() => {
                    util.createBinaryExpr(
                        '=',
                        { type: 'column_ref', table: null, column: 'id' },
                        undefined
                    );
                }).to.throw(ImplementationError)
            });

            it('should parse ANSI SQL compliant statements', () => {
                sql = `SELECT\n "id",\n 'foo' AS "type" \n\nFROM\n "table"`;
                expect(getParsedSql(sql)).to.equal(sql);
            });

            it('should parse DUAL table', () => {
                sql = `SELECT\n "id" \n\nFROM\n DUAL`;
                expect(getParsedSql(sql)).to.equal(sql);
            });
        });

        describe('joins', () => {
            it('should support implicit joins', () => {
                expect(getParsedSql('SELECT a.col , b.c FROM a ,b'))
                    .to.equal('SELECT\n "a"."col",\n "b"."c" \n\nFROM\n "a",\n "b"');
            });

            it('should support (INNER) JOINs', () => {
                sql = 'SELECT a FROM t1 join t2 on t1.t2id = t2.t1id';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t1"\n INNER JOIN\n "t2" \nON "t1"."t2id" = "t2"."t1id"');
            });

            it('should support LEFT JOINs', () => {
                sql = 'SELECT a FROM t1 left join t2 on t1.t2id = t2.t1id';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t1"\n LEFT JOIN\n "t2" \nON "t1"."t2id" = "t2"."t1id"');
            });

            it('should support RIGHT JOINs', () => {
                sql = 'SELECT a FROM t1 right join t2 on t1.t2id = t2.t1id';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t1"\n RIGHT JOIN\n "t2" \nON "t1"."t2id" = "t2"."t1id"');
            });

            it('should support FULL JOINs', () => {
                sql = 'SELECT a FROM t1 full join t2 on t1.t2id = t2.t1id';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t1"\n FULL JOIN\n "t2" \nON "t1"."t2id" = "t2"."t1id"');
            });

            it('should support multiple joins', () => {
                sql = 'SELECT a FROM t1 LEFT JOIN t2 ON t1.t2id = t2.t1id INNER JOIN t3 ON t1.t3id = t3.t1id';
                expect(getParsedSql(sql))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t1"\n LEFT JOIN\n "t2" \nON "t1"."t2id" = "t2"."t1id"\n INNER JOIN\n "t3" \nON "t1"."t3id" = "t3"."t1id"');
            });

            it('should support alias for base table', () => {
                sql = 'SELECT col1 FROM awesome_table t';
                expect(getParsedSql(sql)).to.equal('SELECT\n "col1" \n\nFROM\n "awesome_table" AS "t"');
            });

            it('should support joins with tables from other databases', () => {
                sql = 'SELECT col1 FROM t JOIN otherdb.awesome_table at ON t.id = at.tid';
                expect(getParsedSql(sql))
                    .to.equal('SELECT\n "col1" \n\nFROM\n "t"\n INNER JOIN\n otherdb."awesome_table" AS "at" \nON "t"."id" = "at"."tid"');
            });

            it('should support aliases in joins', () => {
                expect(getParsedSql('SELECT col1 FROM t1 LEFT JOIN awesome_table AS t2 ON t1.id = t2.t1id'))
                    .to.equal('SELECT\n "col1" \n\nFROM\n "t1"\n LEFT JOIN\n "awesome_table" AS "t2" \nON "t1"."id" = "t2"."t1id"');
            });

            it('should support joined subquery', () => {
                expect(getParsedSql('SELECT * FROM t1 LEFT JOIN (SELECT id, col1 FROM t2) AS someAlias ON t1.id = someAlias.id'))
                    .to.equal('SELECT\n * \n\nFROM\n "t1"\n LEFT JOIN\n (SELECT\n "id",\n "col1" \n\nFROM\n "t2") AS "someAlias" \nON "t1"."id" = "someAlias"."id"');
            });

            it('should support USING keyword (single column)', () => {
                expect(getParsedSql('SELECT * FROM t1 JOIN t2 USING (id)'))
                    .to.equal('SELECT\n * \n\nFROM\n "t1"\n INNER JOIN\n "t2" USING ("id")');
            });

            it('should support USING keyword (multiple columns)', () => {
                expect(getParsedSql('SELECT * FROM t1 JOIN t2 USING (id1, id2)'))
                    .to.equal('SELECT\n * \n\nFROM\n "t1"\n INNER JOIN\n "t2" USING ("id1", "id2")');
            });
        });

        describe('where clause', () => {
            ['<', '<=', '=', '!=', '>=', '>'].forEach((operator) => {
                it(`should support simple "${operator}" comparison`, () => {
                    sql = `SELECT a fRom db.t wHERE "type" ${operator} 3`;
                    expect(getParsedSql(sql)).to.equal(`SELECT\n "a" \n\nFROM\n db."t" \n\nWHERE\n "type" ${operator} 3`);
                });
            });

            const operatorMap = { '=': 'IN', '!=': 'NOT IN' };
            Object.keys(operatorMap).forEach((operator) => {
                const sqlOperator = operatorMap[operator];

                it(`should convert "${operator}" to ${sqlOperator} operator for array values`, () => {
                    const ast = {
                        type: 'select',
                        options: null,
                        distinct: null,
                        columns: [{ expr: { type: 'column_ref', table: null, column: 'a' }, as: null }],
                        from: [{ db: null, table: 't', as: null }],
                        where: {
                            type: 'binary_expr',
                            operator: operator,
                            left: { type: 'column_ref', table: null, column: 'id' },
                            right: {
                                type: 'expr_list',
                                value: [{ type: 'number', value: 1 }, { type: 'number', value: 2 }]
                            }
                        },
                        groupby: null,
                        limit: null
                    };

                    expect(util.astToSQL(ast)).to.equal(`SELECT\n "a" \n\nFROM\n "t" \n\nWHERE\n "id" ${sqlOperator} (1, 2)`);
                });
            });

            ['IN', 'NOT IN'].forEach((operator) => {
                it(`should support ${operator} operator`, () => {
                    sql = `SELECT a FROM t WHERE id ${operator.toLowerCase()} (1, 2, 3)`;
                    expect(getParsedSql(sql)).to.equal(`SELECT\n "a" \n\nFROM\n "t" \n\nWHERE\n "id" ${operator} (1, 2, 3)`);
                });
            });

            ['IS', 'IS NOT'].forEach((operator) => {
                it(`should support ${operator} operator`, () => {
                    sql = `SELECT a FROM t WHERE col ${operator.toLowerCase()} NULL`;
                    expect(getParsedSql(sql)).to.equal(`SELECT\n "a" \n\nFROM\n "t" \n\nWHERE\n "col" ${operator} NULL`);
                });
            });

            it('should support query param values', () => {
                sql =  'SELECT * FROM t where t.a > :my_param';
                expect(getParsedSql(sql)).to.equal('SELECT\n * \n\nFROM\n "t" \n\nWHERE\n "t"."a" > :my_param');
            });

            it('should support AND binary where', () => {
              sql =  'SELECT * FROM t where t.a > :my_param AND t.a = \'banana\'';
              expect(getParsedSql(sql)).to.equal('SELECT\n * \n\nFROM\n "t" \n\nWHERE\n "t"."a" > :my_param AND\n "t"."a" = \'banana\'');
            });

            it('should support OR binary where', () => {
              sql =  'SELECT * FROM t where t.a > :my_param OR t.a = \'banana\'';
              expect(getParsedSql(sql)).to.equal('SELECT\n * \n\nFROM\n "t" \n\nWHERE\n "t"."a" > :my_param OR\n "t"."a" = \'banana\'');
            });

            it('should support map values', () => {
                sql =  'SELECT * FROM t where t.a[\'value\'] = \'something\'';
                expect(getParsedSql(sql)).to.equal('SELECT\n * \n\nFROM\n "t" \n\nWHERE\n "t".a[\'value\'] = \'something\'');
            });


            ['BETWEEN', 'NOT BETWEEN'].forEach((operator) => {
                it(`should support ${operator} operator`, () => {
                    sql = `SELECT a FROM t WHERE id ${operator.toLowerCase()} '1' and 1337`;
                    expect(getParsedSql(sql)).to.equal(`SELECT\n "a" \n\nFROM\n "t" \n\nWHERE\n "id" ${operator} '1' AND 1337`);
                });
            });

            it('should support boolean values', () => {
                sql = 'SELECT col1 FROM t WHERE col2 = false';
                expect(getParsedSql(sql)).to.equal('SELECT\n "col1" \n\nFROM\n "t" \n\nWHERE\n "col2" = FALSE');
            });

            it('should support string values', () => {
                expect(getParsedSql(`SELECT col1 FROM t WHERE col2 = 'foobar'`))
                    .to.equal(`SELECT\n "col1" \n\nFROM\n "t" \n\nWHERE\n "col2" = 'foobar'`);
            });

            it('should support bool values', () => {
                expect(getParsedSql(`SELECT col1 FROM t WHERE col2 = FALSE`))
                    .to.equal(`SELECT\n "col1" \n\nFROM\n "t" \n\nWHERE\n "col2" = FALSE`);
            });

            it('should support null values', () => {
                expect(getParsedSql('SELECT col1 FROM t WHERE col2 IS NULL'))
                    .to.equal('SELECT\n "col1" \n\nFROM\n "t" \n\nWHERE\n "col2" IS NULL');
            });

            it('should support array values', () => {
                expect(getParsedSql('SELECT col1 FROM t WHERE col2 IN (1, 3, 5, 7)'))
                    .to.equal('SELECT\n "col1" \n\nFROM\n "t" \n\nWHERE\n "col2" IN (1, 3, 5, 7)');
            });

            ['EXISTS', 'NOT EXISTS'].forEach((operator) => {
                it(`should support ${operator} operator`, () => {
                    expect(getParsedSql(`SELECT a FROM t WHERE ${operator} (SELECT 1)`))
                        .to.equal(`SELECT\n "a" \n\nFROM\n "t" \n\nWHERE\n ${operator} (SELECT\n 1)`);
                });
            });

            it('should support row value constructors', () => {
                expect(getParsedSql(`SELECT * FROM "user" WHERE (firstname, lastname) = ('John', 'Doe')`))
                    .to.equal(`SELECT\n * \n\nFROM\n "user" \n\nWHERE\n ("firstname","lastname") = ('John','Doe')`);
            });
        });

        describe('group clause', () => {
            it('should support single expressions', () => {
                expect(getParsedSql('SELECT a FROM t group by t.b'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY "t"."b"');
            });

            it('should support single expression with a function', () => {
                expect(getParsedSql('SELECT a FROM t group by YEAR(t.b)'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY YEAR("t"."b")');
            });

            it('should support multiple expressions', () => {
                expect(getParsedSql('SELECT a FROM t GROUP BY t.b, t.c'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY "t"."b", "t"."c"');
            });

            it('should support group by with map', () => {
              expect(getParsedSql('SELECT a FROM t group by t.b, t.c[\'hello\']'))
                  .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY "t"."b", "t".c[\'hello\']');
            });
            it('should support group by with date function', () => {
               expect(getParsedSql('SELECT a FROM t GROUP by MONTH(t.b), t.c')).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY MONTH("t"."b"), "t"."c"');
            });
        });

        describe('having clause', () => {
            it('should support simple expressions', () => {
                expect(getParsedSql('SELECT a FROM t GROUP BY t.b having COUNT(*) > 1'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY "t"."b" \n\nHAVING COUNT(*) > 1');
            });

            it('should support complex expressions', () => {
                expect(getParsedSql('SELECT a FROM t GROUP BY t.b HAVING COUNT(*) > (SELECT 10)'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nGROUP BY "t"."b" \n\nHAVING COUNT(*) > (SELECT\n 10)');
            });
        });

        describe('order clause', () => {
            it('should support implicit sort order', () => {
                sql = 'SELECT a FROM t order by id';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nORDER BY "id" ASC');
            });

            it('should support explicit sort order', () => {
                sql = 'SELECT a FROM t order by id desc';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nORDER BY "id" DESC');
            });

            it('should support multiple expressions', () => {
                sql = 'SELECT a FROM t order by id desc, name asc';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nORDER BY "id" DESC, "name" ASC');
            });

            it('should support multiple expressions with map', () => {
              sql = 'SELECT a FROM t order by id desc, "a".name[\'hello\'] asc';
              expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nORDER BY "id" DESC, "a".name[\'hello\'] ASC');
            });

            it('should support complex expressions', () => {
                expect(getParsedSql('SELECT a FROM t ORDER BY rand() ASC'))
                    .to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nORDER BY rand() ASC');
            });
        });

        describe('limit clause', () => {
            it('should work w/o offset', () => {
                sql = 'SELECT a FROM t limit 10';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nLIMIT 0,10');
            });

            it('should work w/ offset', () => {
                sql = 'SELECT a FROM t limit 10, 10';
                expect(getParsedSql(sql)).to.equal('SELECT\n "a" \n\nFROM\n "t" \n\nLIMIT 10,10');
            });
        });

        describe('union operator', () => {
            it('should combine multiple statements', () => {
                sql = `select 1 union select '1' union select a from t union (select true)`;
                expect(getParsedSql(sql)).to.equal(`SELECT\n 1 UNION SELECT\n '1' UNION SELECT\n "a" \n\nFROM\n "t" UNION SELECT\n TRUE`);
            });

            it('should be supported in expressions', () => {
                sql = `select * from (select 1 union select 2) t`;
                expect(getParsedSql(sql)).to.equal(`SELECT\n * \n\nFROM\n (SELECT\n 1 UNION SELECT\n 2) AS "t"`);
            });
        });
    });

    describe('control flow', () => {
        describe('case operator', () => {
            it('should support case-when', () => {
                sql = `select case when 1 then 'one' when 2 then 'two' END`;
                expect(getParsedSql(sql)).to.equal(`SELECT\n CASE WHEN 1 THEN 'one' WHEN 2 THEN 'two' END`);
            });

            it('should support case-when-else', () => {
                sql = `select case FUNC(a) when 1 then 'one' when 2 then 'two' else 'more' END FROM t`;
                expect(getParsedSql(sql)).to.equal(`SELECT\n CASE FUNC("a") WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'more' END \n\nFROM\n "t"`);
            });
        });

        describe('if function', () => {
            it('should support simple calls', () => {
                expect(getParsedSql(`SELECT IF(col1 = 'xyz', 'foo', 'bar') FROM t`))
                    .to.equal(`SELECT\n IF("col1" = 'xyz', 'foo', 'bar') \n\nFROM\n "t"`);
            });
        });
    });

    describe('literals', () => {
        it('should support string values', () => {
            sql = `SELECT 'foo'`;
            expect(getParsedSql(sql)).to.equal(`SELECT\n 'foo'`);
        });

        it('should support null values', () => {
            sql = 'SELECT null';
            expect(getParsedSql(sql)).to.equal('SELECT\n NULL');
        });

        describe('datetime', () => {
            const literals = {
                time: '08:23:16',
                date: '1999-12-25',
                timestamp: '1999-12-25 08:23:16'
            };

            Object.keys(literals).forEach((type) => {
                const value = literals[type];

                it(type, () => {
                    expect(getParsedSql(`SELECT ${type} '${value}'`)).to.equal(`SELECT\n ${type.toUpperCase()} '${value}'`);
                });
            });
        });
    });

    describe('placeholder', () => {
        let ast;

        it('should replace single parameter', () => {
            ast = parser.parse('SELECT col FROM t WHERE id = :id');
            ast = util.replaceParams(ast, { id: 1 });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: null, column: 'id' },
                right: { type: 'number', value: 1 }
            });
        });

        it('should replace multiple parameters', () => {
            ast = parser.parse('SELECT col FROM t WHERE id = :id AND "type" = :type');
            ast = util.replaceParams(ast, { id: 1, type: 'foobar' });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: 'AND',
                left: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { type: 'column_ref', table: null, column: 'id' },
                    right: { type: 'number', value: 1 }
                },
                right: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { type: 'column_ref', table: null, column: 'type' },
                    right: { type: 'string', value: 'foobar' }
                }
            });
        });

        it('should set parameter with string', () => {
            ast = parser.parse('SELECT col1 FROM t WHERE col2 = :name');
            ast = util.replaceParams(ast, { name: 'John Doe' });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: null, column: 'col2' },
                right: { type: 'string', value: 'John Doe' }
            });
        });

        it('should set parameter with boolean value', () => {
            ast = parser.parse('SELECT col1 FROM t WHERE isMain = :main');
            ast = util.replaceParams(ast, { main: true });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: null, column: 'isMain' },
                right: { type: 'bool', value: true }
            });
        });

        it('should set parameter with null value', () => {
            ast = parser.parse('SELECT col1 FROM t WHERE col2 = :param');
            ast = util.replaceParams(ast, { param: null });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: null, column: 'col2' },
                right: { type: 'null', value: null }
            });
        });

        it('should set parameter with array as value', () => {
            ast = parser.parse('SELECT col1 FROM t WHERE id = :ids');
            ast = util.replaceParams(ast, { ids: [1, 3, 5, 7] });

            expect(ast.where).to.eql({
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: null, column: 'id' },
                right: {
                    type: 'expr_list',
                    value: [
                        { type: 'number', value: 1 },
                        { type: 'number', value: 3 },
                        { type: 'number', value: 5 },
                        { type: 'number', value: 7 }
                    ]
                }
            });
        });

        it('should throw an exception if no value for parameter is available', () => {
            ast = parser.parse('SELECT col FROM t WHERE id = :id');

            expect(() => {
                util.replaceParams(ast, { foo: 'bar' });
            }).to.throw('no value for parameter :id found');
        });

        it('should return new AST object', () => {
            ast = parser.parse('SELECT col FROM t WHERE id = :id');
            const resolvedParamAST = util.replaceParams(ast, { id: 1 });

            expect(ast).to.not.eql(resolvedParamAST);
        });
    });

    describe('unsupported statements', () => {
        const unsupportedStatements = {
            insert: 'INSERT INTO t (col1, col2) VALUES (1, 2)',
            update: 'UPDATE t SET col1 = 5 WHERE id = 1337'
        };

        Object.keys(unsupportedStatements).forEach((stmtType) => {
            it(`should throw exception for ${stmtType} statements`, () => {
                expect(() => {
                    getParsedSql(unsupportedStatements[stmtType]);
                }).to.throw(Error, 'Only SELECT statements supported at the moment');
            });
        });
    });
});
