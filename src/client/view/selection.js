define(['Bacon', 'jquery', 'underscore', 'messages'],
function(Bacon,           $,        _,    messages) {

var rz_core, // circular dependency, see get_rz_core
    selection_count_element = $('#selection-count');

function selected_ids() {
    return _.pluck(selected, 'id');
}

function Selection() {
}

function new_selection(selected, related)
{
    var ret = new Selection();

    ret.related = related;
    ret.selected = selected;
    return ret;
}

function get_rz_core()
{
    // circular dependency on rz_core, so require.js cannot solve it.
    if (rz_core === undefined) {
        rz_core = require('rz_core');
        listen_on_diff_bus(rz_core.main_graph.diffBus);
    }
    return rz_core;
}

function get_main_graph()
{
    return get_rz_core().main_graph;
}

function get_main_graph_view()
{
    return get_rz_core().main_graph_view;
}

var selected, // these are the nodes that are requested via update
    related,  // these are not directly selected but we want to show them to users
    selected__by_id,
    related__by_id,
    selectionChangedBus = new Bacon.Bus();

function listen_on_diff_bus(diffBus)
{
    diffBus
        .onValue(function (diff) {
            // update due to potentially removed nodes first
            new_selected = selected.filter(function (n) {
                return get_main_graph().find_node__by_id(n.id) !== null;
            });
            new_related = related.filter(function (n) {
                return get_main_graph().find_node__by_id(n.id) !== null;
            });
            // reselect based on current graph
            inner_select(new_selected, new_related);
        });
}

function nodes_to_id_dict(nodes)
{
    return nodes.reduce(
            function(d, v) {
                d[v.id] = v;
                return d;
            }, {});
}

function updateSelectedNodesBus(new_selected, new_related)
{
    if (_.isEqual(selected, new_selected) && _.isEqual(related, new_related)) {
        return;
    }
    selected = new_selected;
    selected__by_id = nodes_to_id_dict(selected);
    related = new_related;
    related__by_id = nodes_to_id_dict(related);
    selection_count_element.text(related.length > 0 ? '' + selected.length + ', ' + related.length : '');
    selectionChangedBus.push(new_selection(selected, related));
}

/* add nodes in nodes_b to a copy of nodes_a in order, skipping duplicates */
function sum_nodes(nodes_a, nodes_b)
{
    var set_a_id = _.object(nodes_a.map(function (n) { return [n.id, 1]; })),
        ret = nodes_a.slice(0);

    for (var k in nodes_b) {
        if (set_a_id[nodes_b[k].id] === undefined) {
            ret.push(nodes_b[k]);
        }
    }
    return ret;
}

function links_to_nodes(links)
{
    return _.flatten(_.map(links, function (link) { return [link.__src, link.__dst]; }));
}

function byVisitors(node_selector, link_selector) {
    var new_selection = get_main_graph().find__by_visitors(node_selector, link_selector);

    inner_select_nodes(sum_nodes(new_selection.nodes, links_to_nodes(new_selection.links)));
}

function connectedComponent(nodes) {
    var connected = get_main_graph().neighbourhood(nodes, 1),
        i,
        node,
        link,
        data;

    for (i = 0 ; i < connected.nodes.length ; ++i) {
        data = connected.nodes[i];
        node = data.node;
        switch (data.type) {
        case 'exit':
            node.state = 'exit';
            break;
        case 'enter':
            node.state = 'enter';
            break;
        };
    }
    for (i = 0 ; i < connected.links.length ; ++i) {
        data = connected.links[i];
        link = data.link;
        switch (data.type) {
        case 'exit':
            link.state = 'exit';
            break;
        case 'enter':
            link.state = 'enter';
            break;
        };
    }
    // XXX side effect, should not be here
    nodes.forEach(function (n) { n.state = 'selected'; });
    return connected.nodes.map(function (d) { return d.node; }).concat(nodes.slice());
}

var node_related = function(node) {
    return related__by_id[node.id] !== undefined;
}

var node_selected = function(node) {
    return selected__by_id[node.id] !== undefined;
}

var node_first_selected = function(node) {
    return selected && selected.length > 0 && node.id === selected[0].id;
}

var link_selected = function(link) {
    return node_related(link.__src) && node_related(link.__dst);
}

var class__node = function(node, temporary) {
    return !temporary && related.length > 0 || selected.length > 0 ?
        (node_first_selected(node) ? 'first-selected' :
            (node_selected(node) ? 'selected' :
                (node_related(node) ? "related" : "notselected"))) : "";
}

var class__link = function(link, temporary) {
    return !temporary && related.length > 0 ? (link_selected(link) ? "selected" : "notselected") : "";
}

var clear = function()
{
    updateSelectedNodesBus([], []);
}

function arr_compare(a1, a2)
{
    if (a1.length != a2.length) {
        return false;
    }
    for (var i = 0 ; i < a1.length ; ++i) {
        if (a1[i] != a2[i]) {
            return false;
        }
    }
    return true;
}

var inner_select_nodes = function(nodes)
{
    inner_select(nodes, connectedComponent(nodes));
}

var select_nodes = function(nodes)
{
    var new_nodes = nodes;
    var not_same = !arr_compare(new_nodes, selected);

    if (not_same) {
        inner_select_nodes(new_nodes);
    }
}

var inner_select = function(new_selected, new_related)
{
    if (arr_compare(new_selected, selected) && arr_compare(new_related, related)) {
        // no change
        return;
    }
    updateSelectedNodesBus(new_selected, new_related);
}

function nodes_from_link(link)
{
    return [link.__src, link.__dst];
}

var select_link = function(link)
{
    var new_selected = nodes_from_link(link);

    inner_select(new_selected, new_selected);
}

function invert(initial, inverted)
{
    return _.union(_.difference(initial, inverted), _.difference(inverted, initial));
}

var invert_link = function(link)
{
    var link_nodes = nodes_from_link(link),
        new_selected = invert(selected, link_nodes),
        new_related = invert(related, link_nodes);

    inner_select(new_selected, new_related);
}

var invert_nodes = function(nodes)
{
    select_nodes(invert(selected, nodes));
}

var setup_toolbar = function(main_graph)
{
    var merge_selection = function() {
            main_graph.nodes__merge(selected_ids());
        },
        delete_selection = function() {
            var ids = selected_ids();

            if (confirm(messages.delete_nodes_message(ids.length))) {
                main_graph.nodes__delete(ids);
            }
        },
        link_fan_selection = function() {
            main_graph.nodes__link_fan(selected_ids());
        },
        merge_btn = $('#btn_merge'),
        delete_btn = $('#btn_delete'),
        link_fan_btn = $('#btn_link_fan'),
        multiple_node_operations = $('#tool-bar-multiple-node-operations');

    merge_btn.asEventStream('click').onValue(merge_selection);
    delete_btn.asEventStream('click').onValue(delete_selection);
    link_fan_btn.asEventStream('click').onValue(link_fan_selection);

    selectionChangedBus.map(function (selection) { return selection.selected.length > 1; })
        .skipDuplicates()
        .onValue(function (visible) {
            if (visible) {
                multiple_node_operations.show();
            } else {
                multiple_node_operations.hide();
            }
        });
}

var is_empty = function() {
    return selected && selected.length == 0;
}

// initialize
clear();

return {
    byVisitors: byVisitors,
    connectedComponent: connectedComponent,
    is_empty: is_empty,
    clear: clear,
    select_nodes: select_nodes,
    invert_nodes: invert_nodes,
    select_link: select_link,
    invert_link: invert_link,
    class__node: class__node,
    class__link: class__link,
    node_selected: node_selected,
    link_selected: link_selected,
    selectionChangedBus: selectionChangedBus,
    setup_toolbar: setup_toolbar,

    selected: function() { return selected; },
    related: function() { return related; },
};

});
