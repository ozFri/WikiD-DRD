"use strict"

define(['jquery', 'Bacon', 'consts', 'rz_bus', 'rz_core', 'textanalysis', 'view/completer'],
function($,        Bacon,   consts,   rz_bus,   rz_core,   textanalysis,   completer) {

var text = "", // Last text of sentence
    element_name = '#textanalyser',
    element = $(element_name),
    element_raw = element[0],
    plus_button = $('.add-button'),
    description = consts.description;

var typeselection = function TypeSelectionDialog() {
    var e = $('.typeselection'),
        typeselection = {};

    typeselection.analysisNodeStart = function() {
        typeselection.show();
        e.html('<table><tr><td style="height:28px"></td></tr><tr><td>Use [TAB] key to pick a type</td></tr></table>');
    }
    typeselection.show = function() {
        e.css({
            top: window.innerHeight/2-115,
            left: window.innerWidth/2-325});
    }
    typeselection.hide = function() {
        e.css('top', -300);
        e.css('left', 0);
    }
    typeselection.showChosenType = function(nodetype) {
        var desc = description[nodetype];
        e.html('<table><tr><td style="height:28px"></td></tr><tr><td>' +
               "Chosen Type: " + nodetype + '</td></tr>' +
               (desc ? '<tr><td>' + desc + '</td></tr>' : '') +
               '</table>');
    }
    return typeselection;
}();

var analysisCompleter = completer(element, $('.suggestion'));

function analyzeSentence(sentence, finalize)
{
    var ret = textanalysis.textAnalyser(sentence, finalize);

    switch (ret.state) {
    case textanalysis.ANALYSIS_NODE_START:
        typeselection.analysisNodeStart();
        break;
    case textanalysis.ANALYSIS_LINK:
        typeselection.hide();
        break;
    }

    var backend_commit = false;
    ret.applyToGraph(rz_core.graph, backend_commit);

    if (finalize || sentence.length == 0) {
        typeselection.hide();
    }
}

function textSelect(inp, s, e) {
    e = e || s;
    if (inp.createTextRange) {
        var r = inp.createTextRange();
        r.collapse(true);
        r.moveEnd('character', e);
        r.moveStart('character', s);
        r.select();
    }else if(inp.setSelectionRange) {
        inp.focus();
        inp.setSelectionRange(s, e);
    }
}

function changeType(arg) {
    var lastnode = textanalysis.lastnode(),
        nodetype,
        id;

    if(!lastnode) {
        id = "new node";
    } else {
        id = lastnode.id;
    }
    nodetype = (arg === 'up'? textanalysis.selected_type_next() : textanalysis.selected_type_prev());

    if (arg === 'up') {
        rz_core.graph.editType(id, null, nodetype);
        typeselection.showChosenType(nodetype);
        rz_core.graph.findCoordinates(id, null);
    } else {
        rz_core.graph.editType(id, null, nodetype);
        typeselection.showChosenType(nodetype);
        rz_core.graph.findCoordinates(id, null);
    }
    rz_core.update_view__graph(true);
}

return {
    analyzeSentence: analyzeSentence,
    main:function () {
        if (element.length != 1) {
            return;
        }

        analysisCompleter.options.plug(textanalysis.suggestions_options);

        var document_keydown = new Bacon.Bus();
        rz_bus.ui_key.plug(document_keydown);

        element.keydown(function(e) {
            var ret = undefined;

            switch (e.keyCode) {
            case 13:
                if (!analysisCompleter.handleEnter()) {
                    submitNewSentence();
                }
                ret = false;
                break;
            case 9: //TAB
                if (textanalysis.lastnode()) {
                    e.preventDefault();
                    changeType(e.shiftKey ? "up" : "down", textanalysis.lastnode());
                    ret = false;
                }
                break;
            case 38: //UP
            case 40: //DOWN
                ret = false;
                break;
            }
            document_keydown.push({where: consts.KEYSTROKE_WHERE_TEXTANALYSIS, keys: [e.keyCode]});
            return ret;
        });
        element.keyup(function(e) {
            var ret = undefined;
            switch (e.keyCode) {
            case 38: //UP
                analysisCompleter.prev_option();
                ret = false;
                break;
            case 40: //DOWN
                analysisCompleter.next_option();
                ret = false;
                break;
            default:
                // This catches cursor move due to keyboard events. no event for cursor movement itself
                // below we catch cursor moves due to mouse click
                analysisCompleter.oninput(element_raw.value, element_raw.selectionStart);
            }
            return ret;
        });
        element.bind('input selectionchange click', function() {
            analysisCompleter.oninput(element_raw.value, element_raw.selectionStart);
        });

        function submitNewSentence() {
            text = element.val();
            element.val("");
            analyzeSentence(text, true);
            text = "";
        }

        // Click is required to prevent the default action - this is a form so that's a post,
        // and away we go.
        // The mousedown is required because CSS3 transitions eat some events sometimes. This is
        // the closest I've come to an explanation:
        //   http://stackoverflow.com/questions/15786891/browser-sometimes-ignores-a-jquery-click-event-during-a-css3-transform
        plus_button.bind("click mousedown", function(e) {
            console.dir(e);
            submitNewSentence();
            e.preventDefault();
        });

        var input = new Bacon.Bus();
        rz_bus.ui_input.plug(input);
        if ('oninput' in document.documentElement) {
            element.on('input', function(e) {
                text = element.val();
                analyzeSentence(text, false);
                input.push({where: consts.INPUT_WHERE_TEXTANALYSIS, input: text});
            });
        } else {
            console.log('textanalysis.ui: fallback to polling');
            window.setInterval(function() {
                if (element.val() != text) {
                    if (text.length * 8 > 500) {
                        element.css('width', text.length * 8 + 20);
                    }
                    // text changed
                    text = element.val();
                    analyzeSentence(text, false);
                    suggestionChange = false;
                }
            }, 50);
        }
    }
};
}); // define
