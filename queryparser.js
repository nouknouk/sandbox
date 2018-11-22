const moo = require('moo')

/*
// specific lexer rules:
  - sublexer:'xxx'
  - nextlexer:'yyy'
  - skiptoken: true,
  - notext: true
*/

let lexerTypes = {
  selectors: {
    space:    { match: /\s+/, lineBreaks: true, skiptoken:true                                         },
    selector: { match: /./,  lineBreaks: true, sublexer:'selector' , notext: true                      },
  },
  
  selector: {
    space:            { match: /\s+/,     lineBreaks: true              , skiptoken: true               },
    end:              { match: /[,]/,     lineBreaks: false, end:true                                   },
    selector_element: { match: /./,       lineBreaks: true,  sublexer:'selector_element' , notext: true },
  },
  selector_element: {
    path:             { match: /@/,       lineBreaks: false             , sublexer:'path'              },
    attribute:        { match: /\[/,      lineBreaks: false             , sublexer:'attribute'         },
    id:               { match: /\#/,      lineBreaks: false             , sublexer:'id'                },
    value:            { match: /:value/,  lineBreaks: false             , sublexer:'value_operator'    },
    has:              { match: /:has\(/,  lineBreaks: false             , sublexer:'has'               },
    not:              { match: /:not\(/,  lineBreaks: false             , sublexer:'not'               },
    empty:            { match: /:empty/,  lineBreaks: false             ,                              }, // elements that have no children
    parent:           { match: /:parent/, lineBreaks: false             ,                              }, // have at least one child node
    end:              { match: /[\),\s]/, lineBreaks: true , end:true  , notext: true                  },
  },
  
  path: {
    separator:        { match: /\//, lineBreaks: false, },
    path_literal:     { match: /[^\/\t\n\s\)|\]\*\?\^]+/, lineBreaks: false, },
    path_token:       { match: /[^\/\t\n\s\)|\]]+/, lineBreaks: false, },
    path_end:         { match: /[\/\t\n\s\)|\]]+/,  lineBreaks: true, end:true, notext: true, skiptoken: true },
  },

  id: {
    id_name:          { match: /[^\/\n\s=<>\*\?\! \t\n\s\]\)]+/, lineBreaks: false,  end:true },
  },  
  
  has: {
    end:              { match: /[\)]/,  lineBreaks: false , end:true  , skiptoken: true},
    space:            { match: /\s+/,   lineBreaks: true,               skiptoken: true},
    has_element:      { match: /./,     lineBreaks: true              , notext: true, sublexer:'selector_element' },
  },
  not: {
    end:              { match: /[\)]/,  lineBreaks: false , end:true  , skiptoken: true},
    space:            { match: /\s+/,   lineBreaks: true,               skiptoken: true},
    not_element:      { match: /./,     lineBreaks: true              , notext: true, sublexer:'selector_element' },
  }, 
  attribute: {
    space:            { match: /\s+/,                            lineBreaks: true, skiptoken: true                 },
    attribute_name:   { match: /[^\/\n\s=<>\*\?\! \t\n\s\]\)]+/, lineBreaks: false, nextlexer:'attribute_operator' },
  },
  attribute_operator: {
    space:            { match: /\s+/,              lineBreaks: true,  skiptoken: true             },
    operator:         { match: /[&|~=<>\*\?!^$]+/, lineBreaks: false, nextlexer:'attribute_value' },
    attribute_end:    { match: /]/,                lineBreaks: true,  end:true, skiptoken: true   },
  },
  attribute_value: {
    null:             { match: /null/, lineBreaks: false, nextlexer:'attribute_end' },
    string:           { match: /"(?:[^"\\]|\\.)*"/, lineBreaks: false, nextlexer:'attribute_end' },
    number:           { match: /-?\d+\.?\d*/,       lineBreaks: false, nextlexer:'attribute_end' },
    bool:             { match: /(?:true|false)/,    lineBreaks: false, nextlexer:'attribute_end' },
  },
  attribute_end: {
    attribute_end:    { match: /]/,                 lineBreaks: true,  end:true, skiptoken: true },
  },

  value_operator: {
    operator:         { match: /[&|~=<>\*\?!^$]+/,  lineBreaks: false, nextlexer:'value_value'   },
    value_end:        { match: /[\/\t\n\s\)|\]]/, lineBreaks: true, notext: true,  end:true, skiptoken: true },
  },
  value_value: {
    null:             { match: /null/, lineBreaks: false, nextlexer:'attribute_end' },
    string:           { match: /"(?:[^"\\]|\\.)*"/, lineBreaks: false,  end:true },
    number:           { match: /-?\d+\.?\d*/,       lineBreaks: false,  end:true },
    bool:             { match: /(?:true|false)/,    lineBreaks: false,  end:true },
  },
}


class Query {
  constructor(types) {
    this.lexerTypes = types;
  }
  buildLexers() {
      this.lexers = {};
      for (var lexername in this.lexerTypes) {
        let type = this.lexerTypes[lexername];

        let lexer;
        try {
          let lexermoodefiniton = {};
          Object.keys(type).forEach( (name) => lexermoodefiniton[name] = { match: type[name].match, lineBreaks:type[name].lineBreaks });
          //console.log(lexermoodefiniton);
          lexer = moo.compile(lexermoodefiniton);
          lexer.type = type;
        } catch (e) {
          throw new Error("error while building lexer '"+lexername+"': "+e);
        }

        for (let tokenname in type) {
          type[tokenname].name = tokenname;
        }
        type.name = lexername;
        type.lexer = lexer;
        this.lexers[lexername] = lexer;
        type.toString = function() { return this.name; };
        type.inspect  = function() { return this.name; };

      }
      console.log(''+Object.keys(this.lexers).length+' lexers compiled: '+JSON.stringify(Object.keys(this.lexers)),"\n");
      this.isBuilt = true;

  }
  parse(query, typename) {
    if (!this.isBuilt) this.buildLexers();

    typename = typename || 'selectors';
    let nextlexer = this.lexers[typename];
    let nextlexertype = this.lexerTypes[typename];
    if (!nextlexer) throw new Error("unknown starting type '"+typename+"'");

    let remainingString = query;
    let rootToken = {
      data: {
        type: typename,
        text: '',
        value: null,
      },
      text: '',
      parent: null,
      children: [],
      lexer: nextlexer,
      lexerType: nextlexertype,
      tokenType: {name:'root'},
    };
    let current = rootToken;
    while (remainingString.length) {

      //console.log("   - string = "+JSON.stringify(remainingString.substr(0,30)));
      nextlexer.reset(remainingString);
      let rawdata = nextlexer.next();
      let tokenType = nextlexertype[rawdata.type];
      console.log("iteration with '"+nextlexertype.name+"'. Found token: ",JSON.stringify(rawdata));

      if (!rawdata) throw new Error("invalid syntax near '"+remainingString+"' ; (lexer="+current.lexerType+")");


      let token = {
        data: rawdata,
        text: '',
        parent: current,
        children: [],
        tokenType: tokenType,
        lexer: tokenType.sublexer ? this.lexers[tokenType.sublexer] : nextlexer,
        lexerType: tokenType.sublexer ? this.lexerTypes[tokenType.sublexer] : nextlexertype,
      };

      if (!token.tokenType.skiptoken) {
        current.children.push(token);
      }
      if (token.tokenType.notext) {
        token.text = '';
      }
      else {
        token.text = token.data.text;
        remainingString = remainingString.slice(token.text.length);
      }
      let t = token.parent;
      while (t) {
        t.text += token.text;
        t = t.parent;
      }

      if (token.tokenType.nextlexer) {
        nextlexertype = this.lexerTypes[token.tokenType.nextlexer];
        nextlexer = this.lexers[token.tokenType.nextlexer];
        nextlexer.reset(remainingString);
      }
      if (token.tokenType.sublexer) {
        current = token;
        nextlexertype = this.lexerTypes[token.tokenType.sublexer];
        nextlexer = this.lexers[token.tokenType.sublexer];
        nextlexer.reset(remainingString);
      }
      if (token.tokenType.end) {
      console.log('END '+current.lexerType);
        let parent = current.parent;
        current = parent;
        nextlexertype = parent.lexerType;
        nextlexer = parent.lexer;
        nextlexer.reset(remainingString);
      }
    }
    while (current) {
      console.log('QUERY FINAL: END '+current.lexerType);
      current = current.parent;
    }
    
    return rootToken;
  }
}

let testString = '@titi/*toto** [attr1] :value>=23 :has(@sub/* [attrSub*="i\'am (a \\"string\\")"]), [attr2=123]';
console.log('testString="'+testString+'"\n');


let query = new Query(lexerTypes);
let result = query.parse(testString, 'selectors');

let render = (token, indent) => {
  (function() {
    let ind = indent || '';
    console.log(ind + "(" + /*token.lexerType.name+"/"+*/token.tokenType.name+") => '"+token.text + "'" );
    token.children.map( (c) => { render(c, ind+"    "); });
  })();
}

console.log("\n\n*** results ***\n");
render(result);
