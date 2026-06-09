"""Tests for the ODK XForm (XML) importer."""

from __future__ import annotations

from app.importers import import_xform
from app.importers.odk_xform import _translate

# A representative XForm exercising binds, itext labels, select1, group, repeat,
# constraint/relevant/required, an upload, and a hidden calculate.
XFORM = """<?xml version="1.0"?>
<h:html xmlns="http://www.w3.org/2002/xforms"
        xmlns:h="http://www.w3.org/1999/xhtml"
        xmlns:jr="http://openrosa.org/javarosa">
  <h:head>
    <h:title>Household survey</h:title>
    <model>
      <instance>
        <data id="household">
          <name/>
          <age/>
          <region/>
          <adult_q/>
          <photo/>
          <total/>
          <members>
            <member_name/>
          </members>
        </data>
      </instance>
      <itext>
        <translation lang="English" default="true()">
          <text id="/data/region:label"><value>Region</value></text>
        </translation>
        <translation lang="French">
          <text id="/data/region:label"><value>Région</value></text>
        </translation>
      </itext>
      <bind nodeset="/data/name" type="string" required="true()"/>
      <bind nodeset="/data/age" type="int" constraint=". &gt;= 0 and . &lt;= 120"
            jr:constraintMsg="0-120"/>
      <bind nodeset="/data/region" type="string"/>
      <bind nodeset="/data/adult_q" type="string" relevant="/data/age &gt;= 18"/>
      <bind nodeset="/data/photo" type="binary"/>
      <bind nodeset="/data/total" type="int" calculate="/data/age * 2"/>
      <bind nodeset="/data/members/member_name" type="string"/>
    </model>
  </h:head>
  <h:body>
    <input ref="/data/name"><label>Your name</label></input>
    <input ref="/data/age"><label>Age</label></input>
    <select1 ref="/data/region">
      <label ref="jr:itext('/data/region:label')"/>
      <item><label>North</label><value>north</value></item>
      <item><label>South</label><value>south</value></item>
    </select1>
    <input ref="/data/adult_q"><label>Adult question</label></input>
    <upload ref="/data/photo" mediatype="image/*"><label>Photo</label></upload>
    <group ref="/data/members">
      <label>Members</label>
      <repeat nodeset="/data/members">
        <input ref="/data/members/member_name"><label>Member name</label></input>
      </repeat>
    </group>
  </h:body>
</h:html>
"""


def _by_name(elements):
    out = {}
    for el in elements:
        out[el.name] = el
        if el.elements:
            out.update(_by_name(el.elements))
    return out


def test_title_and_name():
    form = import_xform(XFORM)
    assert form.title == "Household survey"
    assert form.name == "household"


def test_field_types_mapped():
    form = import_xform(XFORM)
    els = _by_name(form.pages[0].elements)
    assert els["name"].type == "text"
    assert els["age"].type == "integer"
    assert els["region"].type == "single_choice"
    assert els["photo"].type == "image"  # binary + image/* mediatype


def test_select_options_parsed():
    form = import_xform(XFORM)
    region = _by_name(form.pages[0].elements)["region"]
    assert [o.value for o in region.options] == ["north", "south"]


def test_required_relevant_constraint_translated():
    form = import_xform(XFORM)
    els = _by_name(form.pages[0].elements)
    assert els["name"].required is True
    assert els["adult_q"].visible_if == "age >= 18"
    assert els["age"].validation is not None
    assert els["age"].validation.expression == "value >= 0 and value <= 120"
    assert els["age"].validation.message == "0-120"


def test_calculate_field():
    form = import_xform(XFORM)
    total = _by_name(form.pages[0].elements)["total"]
    assert total.type == "calculated"
    assert total.calculate == "age * 2"
    assert total.read_only is True


def test_group_with_repeat_collapses_to_repeat():
    form = import_xform(XFORM)
    top = {el.name: el for el in form.pages[0].elements}
    # The <group> wrapping a single <repeat> collapses to the repeat itself.
    assert top["members"].type == "repeat"
    assert top["members"].repeat is not None
    assert len(top["members"].elements) == 1
    assert top["members"].elements[0].name == "member_name"


def test_multilingual_label_is_a_map():
    form = import_xform(XFORM)
    region = _by_name(form.pages[0].elements)["region"]
    assert isinstance(region.label, dict)
    assert region.label.get("English") == "Region"
    assert region.label.get("French") == "Région"
    assert set(form.languages) == {"English", "French"}


def test_translate_strips_paths_and_operators():
    assert _translate("/data/age >= 18") == "age >= 18"
    assert _translate("${a/b} = 1") == "b == 1"
    assert _translate("selected(/data/langs, 'fr')") == "selected(langs, 'fr')"
    assert _translate(". != ''") == "value != ''"
