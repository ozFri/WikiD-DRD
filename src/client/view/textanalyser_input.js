define(['jquery', 'Bacon_wrapper', 'util', 'view/completer', 'rz_bus', 'textanalysis', 'consts'],
function($,        Bacon,           util,        completer,   rz_bus,   textanalysis,   consts)
{
// Aliases
var value = util.value;

// Constants
var nbsp = String.fromCharCode(160);

function textanalyser_input(spec) {
    var element_name = spec.element_name,
        ta = {
            spec: spec,
            on_analysis: new Bacon.Bus(),
            on_resize: new Bacon.Bus(),
            element: $(element_name),
        },
        element = ta.element,
        element_raw = element[0],
        initial_width = element.width(),
        analysisCompleter = completer(element, $(spec.completer_name), {hideOnTab: false}),
        document_keydown = new Bacon.Bus(),
        input_bus = new Bacon.Bus();

    analysisCompleter.options.plug(textanalysis.suggestions_options);

    util.assert(1 === element.length);

    var selectionStart = function () {
        return util.selectionStart(element_raw);
    }
    ta.selectionStart = selectionStart;

    function key(val) {
        return function (e) {
            return e.keyCode == val;
        };
    };

    function current_value() {
        return nbsp_to_spaces(value(element_raw));
    }
    ta.value = current_value;

    function nbsp_to_spaces(str) {
        return str.replace(new RegExp(nbsp, 'g'), ' ');
    }

    function stretch_input_to_text_size(text)
    {
        var new_width = Math.min(Math.max(initial_width, text.length * 9 + 20), $(window).width() * 0.8);

        element.width(new_width);
        ta.on_resize.push();
    }

    function update_element(current_text)
    {
        var parts,
            base_parts,
            selection_start;

        selection_start = selectionStart();
        value(element_raw, ''); // this removes span elements as well
        // here we stop treating the element as an input, this only works on a div/other "normal" element
        base_parts = current_text.split(/  /)
        parts = base_parts.slice(0, base_parts.length - 1).map(function (l) { return l + '  '; });
        if (base_parts[base_parts.length - 1].length != 0) {
            parts.push(base_parts[base_parts.length - 1]);
        }
        function span(text, color) {
            return $('<span style="color: ' + color + '">' + text.replace(/ /g, nbsp) + '</span>');
        }
        parts.map(function (part, index) {
            element.append(span(part, index % 2 == 0 ? 'blue' : 'red'));
        });
        util.setSelection(element_raw, selection_start, selection_start);
        stretch_input_to_text_size(current_text);
        return current_text;
    }

    var enters = element.asEventStream('keydown').filter(key(13))
        .map(function (e) {
            var text;

            if (!analysisCompleter.handleEnter()) {
                text = current_value();
                value(element_raw, "");
                return text;
            } else {
                return false;
            }
        });

    rz_bus.ui_key.plug(document_keydown);

    ta.on_sentence = enters.filter(function (v) { return v !== false; });
    ta.on_analysis.plug(enters.filter(function (v) { return v === false; }).map(current_value));
    ta.on_tab = element.asEventStream('keydown').filter(key(9));
    element.asEventStream('keydown').onValue(function (e) {
        document_keydown.push({where: consts.KEYSTROKE_WHERE_TEXTANALYSIS, keys: [e.keyCode]});
    });
    element.asEventStream('input selectionchange click').onValue(function (e) {
        analysisCompleter.oninput(current_value(), selectionStart(element_raw));
        e.stopPropagation();
        e.preventDefault();
    });

    ta.on_analysis.plug(element.asEventStream('input').map(current_value).map(update_element));

    return ta;
};

return textanalyser_input;
}
);